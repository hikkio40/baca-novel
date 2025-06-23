document.addEventListener("DOMContentLoaded", async () => {
    // Utilitas DOM: Fungsi singkat untuk querySelector, querySelectorAll, dan createElement
    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
    const el = (tag, className = "", textContent = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    };

    // Utilitas untuk mengelola URL gambar dari Blogger
    const getThumbnailSrc = (src) => src ? src.replace(/(\/s)(\d+)(\/)/, '$1400$3').replace(/(\/s0)(\/)/, '$1400$2') : '';
    const getFullResSrc = (src) => src ? src.replace(/(\/s)(\d+)(\/)/, '$10$3') : '';

    // Objek D: Menyimpan referensi elemen DOM dan data aplikasi
    const D = {
        appWrap: $(".pembungkus-aplikasi"),
        infoCeritaWrapper: $(".info-cerita-wrapper"),
        deskripsiCerita: $(".deskripsi-cerita"),
        sideNav: $(".sisi-navigasi"),
        mainContent: $("main.konten-utama"),
        gallery: $(".galeri-utama"),
        galleryWrap: $(".wadah-galeri-dengan-tombol"), // Ini yang akan kita scroll
        navGalleryTop: $(".navigasi-galeri-atas"),
        judulGaleri: $(".judul-galeri"),
        body: document.body,
        modalChap: $("#modalBab"),
        closeModalBtn: $(".tutup-modal"),
        modalVolTitle: $("#judulVolumeModal"),
        modalChapList: $("#daftarBabModal"),
        mobVolNav: $(".navigasi-volume-mobile"),
        kontenBaca: $("#kontenBaca"),
        loadingOverlay: $("#loadingOverlay"),
        chapters: [],
        volumes: [],
        feed: [],
        activeChapterIndex: -1,
        postMap: new Map(), // Memetakan postId/URL ke entri feed Blogger
        seriesName: "",

        tombolMulaiBaca: $(".tombol-mulai-baca"),
        tombolVolumeTerbaru: $(".tombol-volume-terbaru"),
        areaTombolAksi: $(".area-tombol-aksi")
    };

    // Fungsi untuk mendeteksi apakah perangkat mobile (lebar layar <= 768px)
    const isMob = () => window.matchMedia("(max-width: 768px)").matches;

    // Kunci untuk localStorage dan fungsi simpan/muat bab terakhir yang dibaca
    const LAST_READ_KEY = "lastReadChapterIndex";
    const saveLastReadChapter = (index) => localStorage.setItem(LAST_READ_KEY, index.toString());
    const loadLastReadChapter = () => {
        const index = parseInt(localStorage.getItem(LAST_READ_KEY), 10);
        return (!isNaN(index) && index >= 0 && index < D.chapters.length) ? index : 0;
    };

    // Mendapatkan label bab yang diformat
    const getChapLabel = (title, labels, chapterCounter) => {
        const lowerCaseLabels = Array.isArray(labels) ? labels.map(l => l.toLowerCase()) : [];
        if (lowerCaseLabels.includes("chapter")) {
            return `Bab ${chapterCounter}: ${title || "Tanpa Judul"}`;
        } else {
            return title || "Tanpa Judul";
        }
    };

    // Mengambil data feed dari Blogger menggunakan Google Apps Script proxy
    const fetchFeed = async () => {
        try {
            // Menggunakan URL proxy Google Apps Script yang kamu berikan
            const response = await fetch("https://script.google.com/macros/s/AKfycbxcZd9hPNfu5wdLKrFM81-Kw4Fp1JSNp4R1fcf-fJako-pBOvXjSKp0hajj0KoAdNTXbA/exec?url=" +
                encodeURIComponent("https://etdsf.blogspot.com/feeds/posts/default?alt=json&max-results=99999"));
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            D.feed = data.feed.entry || [];

            // Membangun peta postId/URL untuk akses entri feed yang cepat
            D.feed.forEach(entry => {
                const postId = entry.id.$t.split('.').pop();
                const postUrl = entry.link.find(l => l.rel === "alternate")?.href;
                if (postId) D.postMap.set(postId, entry);
                if (postUrl) D.postMap.set(postUrl, entry);
            });

        } catch (error) {
            console.error("Gagal memuat daftar cerita:", error);
            // Menampilkan pesan error yang ramah pengguna
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">
                Maaf, gagal memuat daftar cerita. Silakan coba lagi nanti atau periksa URL proxy atau koneksi Anda.
            </p>`;
            D.loadingOverlay.classList.add("hidden"); // Sembunyikan loading jika gagal
        }
    };

    // Memuat konten bab ke dalam elemen DOM
    const loadChapContent = async (chapterElement) => {
        const postId = chapterElement.dataset.postId;
        // Jika sudah dimuat atau tidak ada postId, keluar
        if (!postId || chapterElement.dataset.loaded) return;

        chapterElement.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">Memuat konten...</p>`;

        const entry = D.postMap.get(postId);

        if (entry) {
            // Hapus tag style dari konten untuk mencegah konflik CSS
            const cleanedContent = entry.content.$t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            const originalTitle = entry.title.$t || "Judul Tidak Diketahui";
            chapterElement.innerHTML = `<h3 class="judul-bab-terformat">${originalTitle}</h3>${cleanedContent}`;
        } else {
            chapterElement.innerHTML = `<p style="color:red; padding:20px; text-align:center;">Konten bab tidak ditemukan untuk ID postingan: ${postId}</p>`;
        }
        chapterElement.dataset.loaded = "true"; // Tandai bab sudah dimuat
    };

    // Memperbarui UI navigasi (sidebar, modal, mobile) agar sesuai dengan bab aktif
    const updateNavUI = (preventAccordionToggle = false) => {
        const activeIndex = D.activeChapterIndex;

        // Hapus kelas 'aktif' dari semua elemen navigasi
        $$(".konten-bab").forEach(chap => chap.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.sideNav).forEach(btn => btn.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.modalChapList).forEach(btn => btn.classList.remove("aktif"));
        $$(".tombol-volume", D.mobVolNav).forEach(btn => btn.classList.remove("aktif"));

        if (activeIndex === -1 || activeIndex >= D.chapters.length) return;

        // Tambahkan kelas 'aktif' ke bab yang aktif di mainContent
        const activeChapterElement = D.chapters[activeIndex];
        activeChapterElement.classList.add("aktif");

        // Perbarui navigasi sidebar
        const sideNavChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.sideNav);
        if (sideNavChapBtn) {
            sideNavChapBtn.classList.add("aktif");
            const parentVolWrap = sideNavChapBtn.closest('.volume-bab');
            if (parentVolWrap && !preventAccordionToggle && !parentVolWrap.classList.contains('terbuka')) {
                // Otomatis buka volume yang berisi bab aktif jika belum terbuka
                parentVolWrap.classList.add('terbuka');
                const chapterList = parentVolWrap.querySelector('.daftar-bab');
                if (chapterList) chapterList.style.maxHeight = chapterList.scrollHeight + 'px';
            }
        }

        // Perbarui navigasi modal
        const modalChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.modalChapList);
        if (modalChapBtn) modalChapBtn.classList.add("aktif");

        // Perbarui tinggi daftar bab di sidebar agar sesuai dengan status 'terbuka'
        $$(".volume-bab", D.sideNav).forEach(volBox => {
            const chapterList = volBox.querySelector('.daftar-bab');
            if (chapterList) chapterList.style.maxHeight = volBox.classList.contains('terbuka') ? chapterList.scrollHeight + 'px' : '0';
        });

        // Perbarui navigasi mobile
        const activeVolumeElement = activeChapterElement.closest(".volume-bab");
        const activeVolumeIndex = D.volumes.indexOf(activeVolumeElement);
        $$(".tombol-volume", D.mobVolNav).forEach((btn, i) => {
            btn.classList.toggle("aktif", i === activeVolumeIndex);
        });
    };

    // Membangun galeri ilustrasi berdasarkan volume yang aktif
    const buildGallery = async (volumeIndex) => {
        if (volumeIndex === -1 || volumeIndex >= D.volumes.length) return;

        // Cek apakah galeri sudah dibangun untuk volume ini
        if (D.gallery.dataset.volumeIndex === volumeIndex.toString() && D.gallery.children.length > 0) {
            // Galeri sudah dibangun dan tidak kosong, tidak perlu membangun ulang
            return;
        }

        // Bersihkan galeri sebelumnya
        D.gallery.innerHTML = "";
        D.gallery.dataset.volumeIndex = volumeIndex; // Tandai volume yang saat ini ditampilkan

        const volumeElement = D.volumes[volumeIndex];
        const volumeName = volumeElement.dataset.volume || `Volume ${volumeIndex + 1}`;

        D.judulGaleri.textContent = `Ilustrasi ${volumeName}`;

        const chaptersInVolume = $$("section.konten-bab", volumeElement);
        let chapterCounter = 1;

        for (const chapter of chaptersInVolume) {
            const postId = chapter.dataset.postId;
            const entry = D.postMap.get(postId);
            if (!entry) continue;

            const labels = entry?.category?.map(c => c.term) || [];
            const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);
            // Hanya tingkatkan chapterCounter jika label 'chapter' ada
            if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

            const parser = new DOMParser();
            const doc = parser.parseFromString(entry.content.$t, "text/html");
            // Filter gambar yang tidak disembunyikan atau memiliki kelas 'galeri-saja'
            const images = [...doc.querySelectorAll("img")].filter(img => {
                const style = getComputedStyle(img);
                return style.display !== "none" || img.classList.contains("galeri-saja");
            });

            for (const img of images) {
                const card = el("div", "kartu-gambar");
                const imageClone = el("img");

                // Atur sumber gambar thumbnail dan full-res
                imageClone.src = getThumbnailSrc(img.src);
                imageClone.dataset.fullres = getFullResSrc(img.src);
                imageClone.alt = img.alt || `Ilustrasi dari ${chapterLabel}`;

                card.append(imageClone);
                D.gallery.appendChild(card);
            }
        }
    };

    // Mengaktifkan bab berdasarkan indeksnya
    const activateChap = async (index, preventAccordionToggle = false) => {
        if (index < 0 || index >= D.chapters.length) return;

        // Jika bab yang sama sudah aktif dan sudah dimuat, cukup gulirkan ke sana
        if (D.activeChapterIndex === index && D.chapters[index].dataset.loaded) {
            updateNavUI(preventAccordionToggle);
            // Gulirkan ke bab aktif jika sudah dimuat dan aktif
            D.chapters[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Tambahan: Gulirkan juga ke galeri
            D.galleryWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        D.activeChapterIndex = index;
        saveLastReadChapter(index); // Simpan bab terakhir yang dibaca

        const targetChapter = D.chapters[index];
        await loadChapContent(targetChapter); // Muat konten bab

        updateNavUI(preventAccordionToggle); // Perbarui UI navigasi

        // Perbarui galeri ilustrasi sesuai dengan volume bab yang aktif
        const activeVolumeElement = targetChapter.closest(".volume-bab");
        const activeVolumeIndex = D.volumes.indexOf(activeVolumeElement);
        if (activeVolumeIndex !== -1) {
            await buildGallery(activeVolumeIndex);
        }

        // Efek auto-fokus: Gulirkan ke bab yang baru diaktifkan
        // Ini akan memfokuskan tampilan pada awal bab
        targetChapter.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Tambahan penting: Gulirkan ke wadah galeri setelah bab diaktifkan
        // Ini akan memfokuskan tampilan pada bagian ilustrasi
        D.galleryWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Menampilkan modal daftar bab untuk volume tertentu
    const showChapModal = (volumeIndex) => {
        const volume = D.volumes[volumeIndex];
        const chaptersInVolume = $$("section.konten-bab", volume);

        // Jika volume hanya memiliki satu bab, langsung aktifkan bab tersebut
        if (chaptersInVolume.length === 1) {
            activateChap(D.chapters.indexOf(chaptersInVolume[0]));
            hideChapModal();
            return;
        }

        D.modalVolTitle.textContent = volume.dataset.volume || `Volume ${volumeIndex + 1}`;
        D.modalChapList.innerHTML = ""; // Bersihkan daftar bab sebelumnya

        let chapterCounter = 1;
        chaptersInVolume.forEach((chapter) => {
            const chapterIndex = D.chapters.indexOf(chapter);
            const postId = chapter.dataset.postId;
            const entry = D.postMap.get(postId);

            const labels = entry?.category?.map(c => c.term) || [];
            const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

            if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

            // Buat tombol bab untuk modal
            const button = el("div", D.activeChapterIndex === chapterIndex ? "aktif" : "", chapterLabel);
            button.dataset.indeksKonten = chapterIndex;
            button.onclick = async () => {
                await activateChap(chapterIndex);
                hideChapModal();
            };
            D.modalChapList.appendChild(button);
        });

        D.modalChap.classList.add("aktif"); // Tampilkan modal
    };

    // Menyembunyikan modal daftar bab
    const hideChapModal = () => D.modalChap.classList.remove("aktif");

    // Membangun navigasi sidebar (desktop) dan navigasi mobile (tombol volume)
    const buildNav = () => {
        D.sideNav.innerHTML = '';
        D.mobVolNav.innerHTML = '';

        const isMobile = isMob();

        D.volumes.forEach((volume, volumeIndex) => {
            const chaptersInVolume = $$("section.konten-bab", volume);
            const isSingleChapterVolume = chaptersInVolume.length === 1;
            const volumeTitle = volume.dataset.volume || `Volume ${volumeIndex + 1}`;

            if (isMobile) {
                // Navigasi Mobile (Tombol Volume)
                const button = el("button", "tombol-volume", volumeTitle);
                button.dataset.volumeIndex = volumeIndex;

                if (isSingleChapterVolume) {
                    button.classList.add("satu-bab");
                    button.dataset.indeksKonten = D.chapters.indexOf(chaptersInVolume[0]);
                    button.onclick = () => activateChap(+button.dataset.indeksKonten);
                } else {
                    button.onclick = () => showChapModal(volumeIndex);
                }
                D.mobVolNav.appendChild(button);
            } else {
                // Navigasi Sidebar (Desktop)
                const volumeBox = el("div", "volume-bab");
                const header = el("div", "judul-volume", volumeTitle);
                const arrow = el("span", "panah-akordeon");
                const chapterList = el("div", "daftar-bab");

                header.appendChild(arrow);

                if (isSingleChapterVolume) {
                    volumeBox.classList.add("satu-bab");
                    arrow.style.display = "none"; // Sembunyikan panah jika hanya satu bab
                    header.dataset.indeksKonten = D.chapters.indexOf(chaptersInVolume[0]);
                    header.onclick = () => activateChap(+header.dataset.indeksKonten);
                    chapterList.style.display = "none"; // Sembunyikan daftar bab
                } else {
                    let chapterCounter = 1;
                    chaptersInVolume.forEach((chapter) => {
                        const chapterIndex = D.chapters.indexOf(chapter);
                        const postId = chapter.dataset.postId;
                        const entry = D.postMap.get(postId);

                        const labels = entry?.category?.map(c => c.term) || [];
                        const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

                        if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

                        const chapterButton = el("div", "", chapterLabel);
                        chapterButton.dataset.indeksKonten = chapterIndex;
                        chapterButton.onclick = async () => activateChap(chapterIndex);
                        chapterList.appendChild(chapterButton);
                    });

                    header.onclick = () => {
                        // Tutup semua volume lain saat membuka satu volume (efek akordeon)
                        const isOpen = volumeBox.classList.contains("terbuka");
                        $$(".volume-bab", D.sideNav).forEach(v => {
                            if (v !== volumeBox) {
                                v.classList.remove("terbuka");
                                const otherChapterList = v.querySelector('.daftar-bab');
                                if (otherChapterList) otherChapterList.style.maxHeight = '0';
                            }
                        });

                        volumeBox.classList.toggle("terbuka");
                        const currentIsOpen = volumeBox.classList.contains("terbuka");
                        if (currentIsOpen) {
                            chapterList.style.maxHeight = chapterList.scrollHeight + 'px';
                            // Hapus pemanggilan buildGallery di sini
                        } else {
                            chapterList.style.maxHeight = '0';
                        }
                    };
                }
                volumeBox.append(header, chapterList);
                D.sideNav.appendChild(volumeBox);
            }
        });
        updateNavUI(); // Perbarui UI navigasi setelah dibangun
    };

    // Mengontrol visibilitas bagian-bagian utama aplikasi (info cerita vs konten baca)
    const toggleMainContentVisibility = (show) => {
        if (show) {
            D.areaTombolAksi.style.display = "none";
            D.infoCeritaWrapper.style.display = "none";
            D.deskripsiCerita.style.display = "none";
            D.kontenBaca.classList.remove("konten-tersembunyi-awal");
            D.modalChap.classList.remove("konten-tersembunyi-awal");
        } else {
            D.areaTombolAksi.style.display = "flex";
            D.infoCeritaWrapper.style.display = "flex";
            D.deskripsiCerita.style.display = "block";
            D.kontenBaca.classList.add("konten-tersembunyi-awal");
            D.modalChap.classList.add("konten-tersembunyi-awal");
        }
    };

    // Mereset aplikasi ke tampilan awal
    const resetAppToInitialState = () => {
        toggleMainContentVisibility(false);
        D.gallery.innerHTML = "";
        D.mainContent.innerHTML = "";
        D.sideNav.innerHTML = "";
        D.mobVolNav.innerHTML = "";
        D.activeChapterIndex = -1;
        localStorage.removeItem(LAST_READ_KEY);
        // Penting: Reset juga dataset.volumeIndex di gallery agar tidak ada kondisi "sudah dimuat" yang salah
        delete D.gallery.dataset.volumeIndex;
    };

    // Menginisialisasi semua event listener dan interaksi
    const initInteractions = () => {
        D.closeModalBtn.onclick = hideChapModal;
        D.modalChap.onclick = e => {
            if (e.target === D.modalChap) hideChapModal();
        };

        // Tambahkan tombol gulir galeri dan tombol tutup konten jika belum ada
        if (!$("#galeriScrollLeftBtn", D.navGalleryTop)) {
            const scrollLeftBtn = el("button", "tombol-gulir kiri", "⬅");
            scrollLeftBtn.id = "galeriScrollLeftBtn";
            scrollLeftBtn.onclick = () => D.gallery.scrollBy({ left: -250, behavior: "smooth" });
            D.navGalleryTop.appendChild(scrollLeftBtn);

            const scrollRightBtn = el("button", "tombol-gulir kanan", "➡");
            scrollRightBtn.id = "galeriScrollRightBtn";
            scrollRightBtn.onclick = () => D.gallery.scrollBy({ left: 250, behavior: "smooth" });
            D.navGalleryTop.appendChild(scrollRightBtn);

            const closeBtn = el("button", "tombol-tutup-konten", "X");
            closeBtn.id = "closeContentBtn";
            closeBtn.onclick = resetAppToInitialState; // Tombol untuk kembali ke tampilan awal
            D.navGalleryTop.appendChild(closeBtn);
        }

        // Lightbox untuk gambar galeri
        D.gallery.onclick = e => {
            const imageElement = e.target.closest(".kartu-gambar img");
            if (!imageElement) return;

            const overlay = el("div", "kotak-cahaya");
            const fullImage = el("img");
            const fullResSrc = imageElement.dataset.fullres || imageElement.src;
            Object.assign(fullImage, { src: fullResSrc, alt: imageElement.alt });
            overlay.appendChild(fullImage);
            D.body.appendChild(overlay);
            overlay.onclick = () => overlay.remove(); // Tutup lightbox saat diklik
        };

        // Penanganan klik tombol "Mulai Baca" dan "Volume Terbaru"
        const handleActionButtonClick = async (action) => {
            D.loadingOverlay.classList.remove("hidden");
            // **PENTING:** Gulirkan ke overlay loading agar pengguna fokus ke sana
            D.loadingOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            toggleMainContentVisibility(true);
            await initContent(action);
            D.loadingOverlay.classList.add("hidden");
        };

        if (D.tombolMulaiBaca) {
            D.tombolMulaiBaca.onclick = () => handleActionButtonClick(0); // Memuat bab pertama
        } else {
            console.warn("Elemen .tombol-mulai-baca tidak ditemukan.");
        }

        if (D.tombolVolumeTerbaru) {
            D.tombolVolumeTerbaru.onclick = () => handleActionButtonClick(-1); // Memuat bab pertama dari volume terbaru
        } else {
            console.warn("Elemen .tombol-volume-terbaru tidak ditemukan.");
        }

        // Penanganan perubahan ukuran jendela untuk membangun ulang navigasi (mobile/desktop)
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (!D.kontenBaca.classList.contains("konten-tersembunyi-awal")) {
                    buildNav(); // Bangun ulang navigasi jika konten baca sedang ditampilkan
                }
            }, 250);
        });
    };

    // Fungsi utama untuk menginisialisasi konten cerita (bab dan volume)
    const initContent = async (initialChapterAction = null) => {
        D.seriesName = D.mainContent.dataset.label || "Series Tanpa Nama";

        await fetchFeed(); // Ambil data feed dari Blogger

        // Sembunyikan loading jika fetchFeed sudah menampilkan error
        if (D.feed.length === 0 && D.mainContent.innerHTML.includes("Maaf, gagal memuat daftar cerita.")) {
            D.loadingOverlay.classList.add("hidden");
            return; // Hentikan inisialisasi lebih lanjut jika gagal fetch feed
        }

        // Bersihkan volume dan bab yang mungkin ada sebelumnya
        $$('.volume-bab', D.mainContent).forEach(volEl => volEl.remove());
        D.volumes = [];
        D.chapters = [];

        const volumesData = {}; // Objek sementara untuk mengelompokkan bab berdasarkan volume
        const filteredFeed = D.feed.filter(entry => {
            const labels = entry.category?.map(c => c.term) || [];
            const hasVolumeLabel = labels.some(l => l.toLowerCase().startsWith("volume "));
            const hasChapterLabel = labels.some(l => l.toLowerCase().startsWith("chapter "));
            // Filter postingan berdasarkan nama seri dan label volume/chapter
            return labels.includes(D.seriesName) && hasVolumeLabel && hasChapterLabel;
        });

// TAMBAHKAN BARIS INI
console.log("Filtered Feed for", D.seriesName, ":", filteredFeed);
// DAN BARIS INI UNTUK MENUNJUKKAN LABEL DARI SEMUA ENTRI SEBELUM FILTER
console.log("All raw labels from D.feed:", D.feed.map(entry => entry.category?.map(c => c.term) || []));

        // Isi volumesData dengan bab yang relevan
        filteredFeed.forEach(entry => {
            const labels = entry.category?.map(c => c.term) || [];
            const volumeLabel = labels.find(l => l.toLowerCase().startsWith("volume "));
            const chapterLabel = labels.find(l => l.toLowerCase().startsWith("chapter "));

            if (volumeLabel && chapterLabel) {
                const volumeNumber = parseInt(volumeLabel.match(/\d+/)?.[0]);
                const chapterNumber = parseInt(chapterLabel.match(/\d+/)?.[0]) || 1; // Default 1 jika tidak ada nomor chapter

                if (volumeNumber !== null) {
                    const volKey = `Volume ${volumeNumber}`;
                    if (!volumesData[volKey]) volumesData[volKey] = [];
                    volumesData[volKey].push({ entry: entry, order: chapterNumber });
                }
            }
        });

        // Urutkan volume secara numerik
        const sortedVolumeKeys = Object.keys(volumesData).sort((a, b) => {
            return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
        });

        // Buat elemen DOM untuk volume dan bab
        sortedVolumeKeys.forEach(volKey => {
            const volumeElement = el('div', 'volume-bab');
            volumeElement.dataset.volume = volKey;
            D.mainContent.appendChild(volumeElement);
            D.volumes.push(volumeElement);

            // Urutkan bab dalam setiap volume
            volumesData[volKey].sort((a, b) => a.order - b.order);

            volumesData[volKey].forEach(item => {
                const chapterElement = el('section', 'konten-bab');
                chapterElement.dataset.postId = item.entry.id.$t.split('.').pop();
                chapterElement.dataset.indeks = D.chapters.length; // Simpan indeks global bab
                volumeElement.appendChild(chapterElement);
                D.chapters.push(chapterElement);
            });
        });

        // Tampilkan pesan error jika tidak ada bab yang ditemukan setelah pemrosesan
        if (D.chapters.length === 0) {
            const errorMessage = `Tidak ada bab yang ditemukan dengan label '${D.seriesName}' dan label volume/chapter yang sesuai. Pastikan postingan Anda memiliki label yang benar.`;
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">${errorMessage}</p>`;
            console.warn("Tidak ada bab relevan ditemukan. Aplikasi tidak dapat diinisialisasi sepenuhnya.");
            D.loadingOverlay.classList.add("hidden"); // Pastikan loading hilang
            return;
        }

        // Tentukan bab mana yang akan dimuat pertama kali
        let targetChapterIndex = 0;
        if (initialChapterAction === -1) { // Jika "Volume Terbaru" diklik
            if (D.volumes.length > 0) {
                const latestVolume = D.volumes[D.volumes.length - 1];
                const chaptersInLatestVolume = $$("section.konten-bab", latestVolume);
                if (chaptersInLatestVolume.length > 0) {
                    targetChapterIndex = D.chapters.indexOf(chaptersInLatestVolume[0]);
                }
            }
        } else if (typeof initialChapterAction === 'number' && initialChapterAction >= 0) {
            targetChapterIndex = initialChapterAction; // Jika indeks bab spesifik diberikan
        } else {
            targetChapterIndex = loadLastReadChapter(); // Muat bab terakhir yang dibaca
        }

        // Aktifkan bab target dan bangun navigasi
        await activateChap(targetChapterIndex, true); // `true` untuk preventAccordionToggle agar tidak terbuka otomatis saat init
        buildNav();

        // Hapus pemanggilan buildGallery di sini
    };

    // Fungsi inisialisasi aplikasi saat DOM selesai dimuat
    const initApp = () => {
        toggleMainContentVisibility(false); // Pastikan tampilan awal adalah info cerita
        initInteractions(); // Siapkan semua event listener
    };

    // Jalankan inisialisasi aplikasi
    initApp();
});
