document.addEventListener("DOMContentLoaded", async () => {
    // Fungsi pembantu untuk seleksi DOM dan pembuatan elemen
    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
    const el = (tag, className = "", textContent = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    };

    // Fungsi untuk mendapatkan URL gambar thumbnail dan resolusi penuh dari Blogger
    const getThumbnailSrc = (src) => {
        if (!src) return '';
        return src.replace(/(\/s)(\d+)(\/)/, '$1400$3').replace(/(\/s0)(\/)/, '$1400$2');
    };

    const getFullResSrc = (src) => {
        if (!src) return '';
        return src.replace(/(\/s)(\d+)(\/)/, '$10$3');
    };

    // Objek untuk menyimpan referensi elemen DOM dan data aplikasi
    const D = {
        appWrap: $(".pembungkus-aplikasi"),
        sideNav: $(".sisi-navigasi"),
        mainContent: $("main.konten-utama"),
        gallery: $(".galeri-utama"),
        galleryWrap: $(".wadah-galeri-dengan-tombol"),
        navGalleryTop: $(".navigasi-galeri-atas"),
        judulGaleri: $(".judul-galeri"),
        body: document.body,
        modalChap: $("#modalBab"),
        closeModalBtn: $(".tutup-modal"),
        modalVolTitle: $("#judulVolumeModal"),
        modalChapList: $("#daftarBabModal"),
        mobVolNav: $(".navigasi-volume-mobile"),
        tombolMulaiBaca: $("#tombolMulaiBaca"),
        tombolVolumeTerbaru: $("#tombolVolumeTerbaru"),
        kontenBaca: $("#kontenBaca"),
        loadingOverlay: $("#loadingOverlay"),
        chapters: [], // Array of chapter DOM elements
        volumes: [],    // Array of volume DOM elements
        feed: [],       // Array of fetched blog post entries
        activeChapterIndex: -1, // Menyimpan indeks bab yang sedang aktif
    };

    let isActivating = false; // Flag untuk mencegah aktivasi bab ganda saat proses loading/UI update

    // Deteksi mobile
    const isMob = () => window.matchMedia("(max-width: 768px)").matches;

    // Kunci localStorage untuk bab terakhir yang dibaca
    const LAST_READ_KEY = "lastReadChapterIndex";
    const saveLastReadChapter = (index) => localStorage.setItem(LAST_READ_KEY, index.toString());
    const loadLastReadChapter = () => {
        const index = parseInt(localStorage.getItem(LAST_READ_KEY), 10);
        // Pastikan indeks yang dimuat valid dalam `D.chapters.length`
        return (!isNaN(index) && index >= 0 && index < D.chapters.length) ? index : 0;
    };

    // Fungsi untuk menggulir ke elemen target dengan requestAnimationFrame
    const scrollToElement = (targetElement, behavior = "smooth") => {
        if (!targetElement) return;

        // Gunakan requestAnimationFrame untuk memastikan DOM siap dan menghindari jank
        requestAnimationFrame(() => {
            const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spasi-besar")) || 0;
            const targetScrollPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - gap;

            window.scrollTo({
                top: targetScrollPosition,
                behavior: behavior
            });
        });
    };

    // Fungsi untuk mendapatkan label bab yang diformat
    const getChapLabel = (title, labels, chapterCounter) => {
        const specialLabels = {
            prologue: "Prolog",
            interlude: "Interlude",
            bonus: "Bonus",
            epilogue: "Epilog",
            afterword: "Penutup"
        };

        const lowerCaseLabels = Array.isArray(labels) ? labels.map(l => l.toLowerCase()) : [];
        const foundType = lowerCaseLabels.find(l => specialLabels[l]);

        if (foundType) {
            return `${specialLabels[foundType]}: ${title || "Tanpa Judul"}`;
        } else if (lowerCaseLabels.includes("chapter")) {
            return `Bab ${chapterCounter}: ${title || "Tanpa Judul"}`;
        } else {
            return title || "Tanpa Judul";
        }
    };

    // Mengambil feed postingan dari Blogger melalui Google Apps Script
    const fetchFeed = async () => {
        try {
            D.loadingOverlay.classList.remove("hidden");
            const response = await fetch("https://script.google.com/macros/s/AKfycbxcZd9hPNfu5wdLKrFM81-Kw4Fp1JSNp4R1fcf-fJako-pBOvXjSKp0hajj0KoAdNTXbA/exec?url=" +
                encodeURIComponent("https://etdsf.blogspot.com/feeds/posts/default?alt=json"));
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            D.feed = data.feed.entry || [];
        } catch (error) {
            console.error("Gagal memuat daftar cerita:", error);
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">
                Maaf, gagal memuat daftar cerita. Silakan coba lagi nanti atau periksa koneksi internet Anda.
            </p>`;
        } finally {
            D.loadingOverlay.classList.add("hidden");
        }
    };

    // Memuat konten bab dari feed
    const loadChapContent = async (chapterElement) => {
        if (chapterElement.dataset.loaded) return;

        chapterElement.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">Memuat konten...</p>`;

        const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chapterElement.dataset.url);

        if (entry) {
            const cleanedContent = entry.content.$t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            chapterElement.innerHTML = `<h3>${entry.title.$t}</h3>${cleanedContent}`;
        } else {
            chapterElement.innerHTML = `<p style="color:red; padding:20px; text-align:center;">Konten bab tidak ditemukan untuk URL: ${chapterElement.dataset.url}</p>`;
        }
        chapterElement.dataset.loaded = "true";
    };

    // Memperbarui status aktif untuk semua elemen navigasi bab
    const updateNavUI = () => {
        const activeIndex = D.activeChapterIndex;

        // Reset semua status aktif
        $$(".konten-bab").forEach(chap => chap.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.sideNav).forEach(btn => btn.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.modalChapList).forEach(btn => btn.classList.remove("aktif"));
        $$(".tombol-volume", D.mobVolNav).forEach(btn => btn.classList.remove("aktif"));

        if (activeIndex === -1 || activeIndex >= D.chapters.length) {
            // Tidak ada bab aktif, atau indeks tidak valid
            return;
        }

        const activeChapterElement = D.chapters[activeIndex];
        activeChapterElement.classList.add("aktif");

        // Update sideNav chapter button
        const sideNavChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.sideNav);
        if (sideNavChapBtn) {
            sideNavChapBtn.classList.add("aktif");
            // Gulir sideNav agar bab aktif terlihat
            if (!isMob()) { // Hanya untuk desktop sideNav
                sideNavChapBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        // Update modal chapter button
        const modalChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.modalChapList);
        if (modalChapBtn) {
            modalChapBtn.classList.add("aktif");
        }

        // Handle volume states for both sideNav and mobVolNav
        const activeVolumeElement = activeChapterElement.closest(".volume-bab");
        const activeVolumeIndex = D.volumes.indexOf(activeVolumeElement);

        $$(".volume-bab", D.sideNav).forEach((volBox, i) => {
            const isOpen = i === activeVolumeIndex && !isMob(); // Hanya buka di desktop
            volBox.classList.toggle("terbuka", isOpen);
        });

        $$(".tombol-volume", D.mobVolNav).forEach((btn, i) => {
            const isActive = i === activeVolumeIndex;
            btn.classList.toggle("aktif", isActive);
            if (isActive && isMob()) {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        });
        
        // Perbarui galeri jika volume berubah
        if (activeVolumeIndex !== -1 && (+D.gallery.dataset.volumeIndex !== activeVolumeIndex)) {
            buildGallery(activeVolumeIndex);
        }
    };

    // Membangun dan mengisi galeri ilustrasi untuk volume tertentu
    const buildGallery = async (volumeIndex) => {
        if (volumeIndex === -1 || volumeIndex >= D.volumes.length) return;

        D.gallery.innerHTML = "";
        D.gallery.dataset.volumeIndex = volumeIndex;

        const volumeElement = D.volumes[volumeIndex];
        const volumeName = volumeElement.dataset.volume || `Volume ${volumeIndex + 1}`;

        D.judulGaleri.textContent = `Ilustrasi ${volumeName}`;

        const chaptersInVolume = $$("section.konten-bab", volumeElement);
        let chapterCounter = 1;

        for (const chapter of chaptersInVolume) {
            const url = chapter.dataset.url;
            const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === url);
            if (!entry) continue;

            const labels = entry?.category?.map(c => c.term) || [];
            const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);
            if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

            const badgeText = chapterLabel.split(":")[0]?.trim() || "Bab";
            const badgeClass = badgeText.toLowerCase().replace(/\s/g, "-");

            const parser = new DOMParser();
            const doc = parser.parseFromString(entry.content.$t, "text/html");
            const images = [...doc.querySelectorAll("img")].filter(img => {
                const style = getComputedStyle(img);
                return style.display !== "none" || img.classList.contains("galeri-saja");
            });

            for (const img of images) {
                const card = el("div", "kartu-gambar");
                const badge = el("div", `lencana-bab ${badgeClass}`, badgeText);
                const imageClone = el("img");

                imageClone.src = getThumbnailSrc(img.src);
                imageClone.dataset.fullres = getFullResSrc(img.src);
                imageClone.alt = img.alt || `Ilustrasi dari ${chapterLabel}`;

                card.append(badge, imageClone);
                D.gallery.appendChild(card);
            }
        }
    };

    // Mengaktifkan bab tertentu: Hanya mengubah status data dan memuat konten
    const activateChap = async (index) => {
        if (isActivating || index < 0 || index >= D.chapters.length) return;
        if (D.activeChapterIndex === index) { // Jika sudah aktif, hanya update UI dan return
            updateNavUI();
            return;
        }

        isActivating = true;
        D.activeChapterIndex = index;
        saveLastReadChapter(index);

        const targetChapter = D.chapters[index];
        await loadChapContent(targetChapter);
        
        updateNavUI(); // Perbarui UI navigasi berdasarkan D.activeChapterIndex
        isActivating = false;
    };

    // Menampilkan modal daftar bab
    const showChapModal = (volumeIndex) => {
        const volume = D.volumes[volumeIndex];
        const chaptersInVolume = $$("section.konten-bab", volume);

        if (chaptersInVolume.length === 1) {
            activateChap(D.chapters.indexOf(chaptersInVolume[0]));
            hideChapModal();
            return;
        }

        D.modalVolTitle.textContent = volume.dataset.volume || `Volume ${volumeIndex + 1}`;
        D.modalChapList.innerHTML = "";

        let chapterCounter = 1;

        chaptersInVolume.forEach((chapter) => {
            const chapterIndex = D.chapters.indexOf(chapter);
            const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chapter.dataset.url);
            const labels = entry?.category?.map(c => c.term) || [];

            const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

            if (labels.map(l => l.toLowerCase()).includes("chapter")) {
                chapterCounter++;
            }

            const button = el("div", D.activeChapterIndex === chapterIndex ? "aktif" : "", chapterLabel);
            button.dataset.indeksKonten = chapterIndex;
            button.onclick = async () => {
                await activateChap(chapterIndex);
                hideChapModal();
                scrollToElement(D.chapters[chapterIndex]); // Gulir setelah modal ditutup dan bab diaktifkan
            };
            D.modalChapList.appendChild(button);
        });

        D.modalChap.classList.add("aktif");
        // Gulir ke galeri saat modal bab muncul
        scrollToElement(D.galleryWrap); 
    };

    // Menyembunyikan modal daftar bab
    const hideChapModal = () => D.modalChap.classList.remove("aktif");

    // Membangun navigasi samping (desktop) dan navigasi mobile (gulir horizontal)
    const buildNav = () => {
        D.sideNav.innerHTML = '';
        D.mobVolNav.innerHTML = '';

        const isMobile = isMob();

        D.volumes.forEach((volume, volumeIndex) => {
            const chaptersInVolume = $$("section.konten-bab", volume);
            const isSingleChapterVolume = chaptersInVolume.length === 1;
            const volumeTitle = volume.dataset.volume || `Volume ${volumeIndex + 1}`;

            if (isMobile) {
                const button = el("button", "tombol-volume", volumeTitle);
                button.dataset.volumeIndex = volumeIndex;

                if (isSingleChapterVolume) {
                    button.classList.add("satu-bab");
                    button.dataset.indeksKonten = D.chapters.indexOf(chaptersInVolume[0]);
                    button.onclick = () => {
                        activateChap(+button.dataset.indeksKonten);
                        scrollToElement(D.chapters[D.activeChapterIndex]);
                    };
                } else {
                    button.onclick = () => {
                        showChapModal(volumeIndex);
                        // Guliran ke D.galleryWrap sudah ditangani di dalam showChapModal
                    };
                }
                D.mobVolNav.appendChild(button);
            } else { // Desktop navigation
                const volumeBox = el("div", "volume-bab");
                const header = el("div", "judul-volume", volumeTitle);
                const arrow = el("span", "panah-akordeon");
                const chapterList = el("div", "daftar-bab");

                header.appendChild(arrow);

                if (isSingleChapterVolume) {
                    volumeBox.classList.add("satu-bab");
                    arrow.style.display = "none";
                    header.dataset.indeksKonten = D.chapters.indexOf(chaptersInVolume[0]);
                    header.onclick = () => {
                        activateChap(+header.dataset.indeksKonten);
                        scrollToElement(D.chapters[D.activeChapterIndex]);
                    };
                    chapterList.style.display = "none";
                } else {
                    let chapterCounter = 1;
                    chaptersInVolume.forEach((chapter) => {
                        const chapterIndex = D.chapters.indexOf(chapter);
                        const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chapter.dataset.url);
                        const labels = entry?.category?.map(c => c.term) || [];
                        const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

                        if (labels.map(l => l.toLowerCase()).includes("chapter")) {
                            chapterCounter++;
                        }

                        const chapterButton = el("div", "", chapterLabel);
                        chapterButton.dataset.indeksKonten = chapterIndex;
                        chapterButton.onclick = async () => {
                            await activateChap(chapterIndex);
                            scrollToElement(D.chapters[chapterIndex]);
                        };
                        chapterList.appendChild(chapterButton);
                    });
                    header.onclick = () => {
                        const isOpen = volumeBox.classList.contains("terbuka");
                        $$(".volume-bab", D.sideNav).forEach(v => v.classList.remove("terbuka")); // Tutup semua
                        if (!isOpen) { // Hanya buka jika sebelumnya tertutup
                            volumeBox.classList.add("terbuka");
                            buildGallery(volumeIndex);
                            scrollToElement(D.galleryWrap); // Gulir ke galeri saat volume dibuka
                        }
                    };
                }
                volumeBox.append(header, chapterList);
                D.sideNav.appendChild(volumeBox);
            }
        });
        updateNavUI(); // Pastikan UI navigasi diperbarui setelah dibangun
    };

    // Menginisialisasi semua interaksi pengguna
    const initInteractions = () => {
        D.closeModalBtn.onclick = hideChapModal;
        D.modalChap.onclick = e => {
            if (e.target === D.modalChap) hideChapModal();
        };

        if (!$("#galeriScrollLeftBtn", D.navGalleryTop)) {
            const scrollLeftBtn = el("button", "tombol-gulir kiri", "⬅");
            scrollLeftBtn.id = "galeriScrollLeftBtn";
            scrollLeftBtn.onclick = () => D.gallery.scrollBy({
                left: -250,
                behavior: "smooth"
            });
            D.navGalleryTop.appendChild(scrollLeftBtn);

            const scrollRightBtn = el("button", "tombol-gulir kanan", "➡");
            scrollRightBtn.id = "galeriScrollRightBtn";
            scrollRightBtn.onclick = () => D.gallery.scrollBy({
                left: 250,
                behavior: "smooth"
            });
            D.navGalleryTop.appendChild(scrollRightBtn);
        }

        D.gallery.onclick = e => {
            const imageElement = e.target.closest(".kartu-gambar img");
            if (!imageElement) return;

            const overlay = el("div", "kotak-cahaya");
            const fullImage = el("img");
            const fullResSrc = imageElement.dataset.fullres || imageElement.src;
            Object.assign(fullImage, {
                src: fullResSrc,
                alt: imageElement.alt
            });
            overlay.appendChild(fullImage);
            D.body.appendChild(overlay);
            overlay.onclick = () => overlay.remove();
        };

        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(async () => {
                // Jangan lakukan resize logic jika konten belum terlihat
                if (D.kontenBaca.classList.contains("konten-tersembunyi-awal")) return;
                
                buildNav(); // Bangun ulang navigasi untuk adaptasi mobile/desktop
                updateNavUI(); // Perbarui UI navigasi berdasarkan D.activeChapterIndex
                
                // Gulir ke bab aktif setelah resize, atau ke galeri jika bab belum dipilih
                if (D.activeChapterIndex !== -1 && D.chapters[D.activeChapterIndex]) {
                    scrollToElement(D.chapters[D.activeChapterIndex], "instant"); // Gulir instan saat resize
                } else if (D.galleryWrap && D.galleryWrap.offsetHeight > 0) {
                    scrollToElement(D.galleryWrap, "instant");
                } else {
                    scrollToElement(D.mainContent, "instant");
                }
            }, 250);
        });

        // Tombol "Mulai Baca" akan selalu mengaktifkan bab pertama (indeks 0)
        D.tombolMulaiBaca.onclick = async () => {
            D.kontenBaca.classList.remove("konten-tersembunyi-awal");
            D.modalChap.classList.remove("konten-tersembunyi-awal");
            D.tombolMulaiBaca.style.display = "none";
            D.tombolVolumeTerbaru.style.display = "none";
            
            await initContent(); // Pastikan data dan UI dasar terisi
            
            // Aktifkan bab PERTAMA (indeks 0)
            await activateChap(0); 
            scrollToElement(D.chapters[0]); // Gulir langsung ke bab pertama
        };

        D.tombolVolumeTerbaru.onclick = async () => {
            D.kontenBaca.classList.remove("konten-tersembunyi-awal");
            D.modalChap.classList.remove("konten-tersembunyi-awal");
            D.tombolMulaiBaca.style.display = "none";
            D.tombolVolumeTerbaru.style.display = "none";
            
            await initContent(); // Pastikan data dan UI dasar terisi
            
            const lastVolumeIndex = D.volumes.length - 1;
            if (lastVolumeIndex !== -1) {
                const lastVolumeChapters = $$("section.konten-bab", D.volumes[lastVolumeIndex]);
                if (lastVolumeChapters.length > 0) {
                    await activateChap(D.chapters.indexOf(lastVolumeChapters[0])); // Aktifkan bab pertama di volume terakhir
                }
            } else {
                await activateChap(0); // Fallback ke bab pertama jika tidak ada volume
            }
            scrollToElement(D.galleryWrap); // Gulir ke galeri
        };
    };

    // Inisialisasi konten aplikasi (memuat data dan membangun UI)
    const initContent = async () => {
        D.loadingOverlay.classList.remove("hidden");

        // --- PENTING: Kumpulkan semua elemen volume dan bab sebelum fetchFeed ---
        D.volumes = []; // Reset volumes array
        D.chapters = []; // Reset chapters array
        $$(".volume-bab").forEach((volumeElement, volumeIndex) => {
            D.volumes.push(volumeElement); // Add to D.volumes array
            $$("section.konten-bab", volumeElement).forEach(chapterElement => {
                chapterElement.dataset.indeks = D.chapters.length; // Ensure index is correct
                D.chapters.push(chapterElement);
            });
        });

        await fetchFeed();

        if (D.feed.length === 0 && D.chapters.length === 0) {
            D.loadingOverlay.classList.add("hidden");
            console.warn("Tidak ada data feed atau bab ditemukan. Aplikasi tidak dapat diinisialisasi sepenuhnya.");
            return;
        }
        
        // Aktifkan bab terakhir yang dibaca saat inisialisasi
        // Ini HANYA mengatur D.activeChapterIndex dan memuat konten.
        // Scroll akan dilakukan secara terpisah jika diperlukan (misal: saat refresh).
        await activateChap(loadLastReadChapter());
        
        // Setelah data dimuat dan bab aktif ditetapkan, bangun navigasi
        buildNav(); 
        
        // Gulir ke bab aktif setelah semua UI diinisialisasi untuk pertama kali
        if (D.activeChapterIndex !== -1 && D.chapters[D.activeChapterIndex]) {
            scrollToElement(D.chapters[D.activeChapterIndex]);
        } else if (D.galleryWrap && D.galleryWrap.offsetHeight > 0) {
            scrollToElement(D.galleryWrap);
        } else {
            scrollToElement(D.mainContent);
        }
        
        D.loadingOverlay.classList.add("hidden");
    };

    // Fungsi inisialisasi awal aplikasi saat DOMContentLoaded
    const initApp = () => {
        D.kontenBaca.classList.add("konten-tersembunyi-awal");
        D.modalChap.classList.add("konten-tersembunyi-awal");
        D.tombolMulaiBaca.style.display = "block";
        D.tombolVolumeTerbaru.style.display = "block";
        initInteractions();
        D.loadingOverlay.classList.add("hidden");
    };

    // Jalankan inisialisasi aplikasi
    initApp();
});
