document.addEventListener("DOMContentLoaded", async () => {
    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
    const el = (tag, className = "", textContent = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    };

    const getThumbnailSrc = (src) => src ? src.replace(/(\/s)(\d+)(\/)/, '$1400$3').replace(/(\/s0)(\/)/, '$1400$2') : '';
    const getFullResSrc = (src) => src ? src.replace(/(\/s)(\d+)(\/)/, '$10$3') : '';

    const LAST_READ_KEY = "lastReadChapterIndex";

    const D = {
        appWrap: $(".pembungkus-aplikasi"),
        infoCeritaWrapper: $(".info-cerita-wrapper"),
        deskripsiCerita: $(".deskripsi-cerita"),
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
        kontenBaca: $("#kontenBaca"),
        loadingOverlay: $("#loadingOverlay"),
        chapters: [],
        volumes: [],
        feed: [],
        activeChapterIndex: -1,
        postMap: new Map(),
        seriesName: "",
        tombolMulaiBaca: $(".tombol-mulai-baca"),
        tombolVolumeTerbaru: $(".tombol-volume-terbaru"),
        areaTombolAksi: $(".area-tombol-aksi"),
        
        // --- Bagian baru untuk multiple Apps Script URLs ---
        appsScriptUrls: [
            "https://script.google.com/macros/s/AKfycbxp1T9oDektHbv9T_jo7OoR7E-8B89hCMNUD_eEy0eQyjekV3ckanhsT4chdqiG5egboA/exec",
        ],
        currentAppsScriptUrlIndex: 0,
        // --- Akhir bagian baru ---
    };

    const isMob = () => window.matchMedia("(max-width: 768px)").matches;
    const saveLastReadChapter = (index) => localStorage.setItem(LAST_READ_KEY, index.toString());
    const loadLastReadChapter = () => {
        const index = parseInt(localStorage.getItem(LAST_READ_KEY), 10);
        return (!isNaN(index) && index >= 0 && index < D.chapters.length) ? index : 0;
    };

    const getChapLabel = (title, labels, chapterCounter) => {
        const lowerCaseLabels = Array.isArray(labels) ? labels.map(l => l.toLowerCase()) : [];
        if (lowerCaseLabels.includes("chapter")) {
            return `Bab ${chapterCounter}: ${title || "Tanpa Judul"}`;
        } else {
            return title || "Tanpa Judul";
        }
    };

    const fetchFeed = async () => {
        D.feed = [];
        D.postMap = new Map();
        try {
            if (!D.seriesName) {
                throw new Error("Series name (data-label pada main.konten-utama) tidak ditemukan.");
            }

            const encodedSeriesName = encodeURIComponent(D.seriesName);
            let success = false;
            let lastError = null;

            for (let i = 0; i < D.appsScriptUrls.length; i++) {
                const currentUrl = D.appsScriptUrls[D.currentAppsScriptUrlIndex];
                console.log(`Mencoba mengambil feed dari Apps Script: ${currentUrl}`);

                try {
                    const response = await fetch(`${currentUrl}?seriesLabel=${encodedSeriesName}`);

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} dari ${currentUrl}`);
                    }
                    
                    const data = await response.json();
                    D.feed = data.feed.entry || [];
                    success = true;
                    break; 
                } catch (error) {
                    lastError = error;
                    console.error(`Gagal memuat dari Apps Script ${currentUrl}:`, error);
                    D.currentAppsScriptUrlIndex = (D.currentAppsScriptUrlIndex + 1) % D.appsScriptUrls.length;
                    console.log(`Mencoba Apps Script berikutnya di indeks: ${D.currentAppsScriptUrlIndex}`);
                }
            }

            if (!success) {
                throw new Error(`Gagal memuat daftar cerita setelah mencoba semua Apps Script. Error terakhir: ${lastError.message}`);
            }

            D.feed.forEach(entry => {
                const postId = entry.id.$t.split('.').pop();
                const postUrl = entry.link.find(l => l.rel === "alternate")?.href;
                if (postId) D.postMap.set(postId, entry);
                if (postUrl) D.postMap.set(postUrl, entry);
            });

        } catch (error) {
            console.error("Gagal memuat daftar cerita:", error);
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">
                Maaf, gagal memuat daftar cerita. Silakan coba lagi nanti atau periksa URL proxy atau koneksi Anda.
            </p>`;
            D.loadingOverlay.classList.add("hidden");
        }
    };

    const loadChapContent = async (chapterElement) => {
        const postId = chapterElement.dataset.postId;
        if (!postId || chapterElement.dataset.loaded) return;

        chapterElement.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">Memuat konten...</p>`;

        const entry = D.postMap.get(postId);

        if (entry) {
            const cleanedContent = entry.content.$t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            const originalTitle = entry.title.$t || "Judul Tidak Diketahui";
            chapterElement.innerHTML = `<h3 class="judul-bab-terformat">${originalTitle}</h3>${cleanedContent}`;
        } else {
            chapterElement.innerHTML = `<p style="color:red; padding:20px; text-align:center;">Konten bab tidak ditemukan untuk ID postingan: ${postId}</p>`;
        }
        chapterElement.dataset.loaded = "true";
    };

    const updateNavUI = (preventAccordionToggle = false) => {
        const activeIndex = D.activeChapterIndex;

        $$(".konten-bab").forEach(chap => chap.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.sideNav).forEach(btn => btn.classList.remove("aktif"));
        $$(`[data-indeks-konten]`, D.modalChapList).forEach(btn => btn.classList.remove("aktif"));
        $$(".tombol-volume", D.mobVolNav).forEach(btn => btn.classList.remove("aktif"));

        if (activeIndex === -1 || activeIndex >= D.chapters.length) return;

        const activeChapterElement = D.chapters[activeIndex];
        activeChapterElement.classList.add("aktif");

        const sideNavChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.sideNav);
        if (sideNavChapBtn) {
            sideNavChapBtn.classList.add("aktif");
            const parentVolWrap = sideNavChapBtn.closest('.volume-bab');
            if (parentVolWrap && !preventAccordionToggle && !parentVolWrap.classList.contains('terbuka')) {
                parentVolWrap.classList.add('terbuka');
                const chapterList = parentVolWrap.querySelector('.daftar-bab');
                if (chapterList) chapterList.style.maxHeight = chapterList.scrollHeight + 'px';
            }
        }

        const modalChapBtn = $(`[data-indeks-konten="${activeIndex}"]`, D.modalChapList);
        if (modalChapBtn) modalChapBtn.classList.add("aktif");

        $$(".volume-bab", D.sideNav).forEach(volBox => {
            const chapterList = volBox.querySelector('.daftar-bab');
            if (chapterList) chapterList.style.maxHeight = volBox.classList.contains('terbuka') ? chapterList.scrollHeight + 'px' : '0';
        });

        const activeVolumeElement = activeChapterElement.closest(".volume-bab");
        const activeVolumeIndex = D.volumes.indexOf(activeVolumeElement);
        $$(".tombol-volume", D.mobVolNav).forEach((btn, i) => {
            btn.classList.toggle("aktif", i === activeVolumeIndex);
        });
    };

    const buildGallery = async (volumeIndex) => {
        if (volumeIndex === -1 || volumeIndex >= D.volumes.length) {
             D.gallery.innerHTML = "";
             D.judulGaleri.textContent = "Ilustrasi";
             return;
        }

        if (D.gallery.dataset.volumeIndex === volumeIndex.toString() && D.gallery.children.length > 0) {
            return;
        }

        D.gallery.innerHTML = "";
        D.gallery.dataset.volumeIndex = volumeIndex;

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
            if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

            const parser = new DOMParser();
            const doc = parser.parseFromString(entry.content.$t, "text/html");
            const images = [...doc.querySelectorAll("img")].filter(img => {
                const style = getComputedStyle(img);
                return style.display !== "none" || img.classList.contains("galeri-saja");
            });

            for (const img of images) {
                const card = el("div", "kartu-gambar");
                const imageClone = el("img");

                imageClone.src = getThumbnailSrc(img.src);
                imageClone.dataset.fullres = getFullResSrc(img.src);
                imageClone.alt = img.alt || `Ilustrasi dari ${chapterLabel}`;

                card.append(imageClone);
                D.gallery.appendChild(card);
            }
        }
    };

    const activateChap = async (index, preventAccordionToggle = false) => {
        if (index < 0 || index >= D.chapters.length) return;

        if (D.activeChapterIndex === index && D.chapters[index].dataset.loaded) {
            updateNavUI(preventAccordionToggle);
            D.chapters[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            D.galleryWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        D.activeChapterIndex = index;
        saveLastReadChapter(index);

        const targetChapter = D.chapters[index];
        await loadChapContent(targetChapter);

        updateNavUI(preventAccordionToggle);

        const activeVolumeElement = targetChapter.closest(".volume-bab");
        const activeVolumeIndex = D.volumes.indexOf(activeVolumeElement);
        if (activeVolumeIndex !== -1) {
            await buildGallery(activeVolumeIndex);
        }

        targetChapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
        D.galleryWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

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
            const postId = chapter.dataset.postId;
            const entry = D.postMap.get(postId);

            const labels = entry?.category?.map(c => c.term) || [];
            const chapterLabel = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

            if (labels.map(l => l.toLowerCase()).includes("chapter")) chapterCounter++;

            const button = el("div", D.activeChapterIndex === chapterIndex ? "aktif" : "", chapterLabel);
            button.dataset.indeksKonten = chapterIndex;
            button.onclick = async () => {
                await activateChap(chapterIndex);
                hideChapModal();
            };
            D.modalChapList.appendChild(button);
        });

        D.modalChap.classList.add("aktif");
    };

    const hideChapModal = () => D.modalChap.classList.remove("aktif");

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
                    button.onclick = () => activateChap(+button.dataset.indeksKonten);
                } else {
                    button.onclick = () => showChapModal(volumeIndex);
                }
                D.mobVolNav.appendChild(button);
            } else {
                const volumeBox = el("div", "volume-bab");
                const header = el("div", "judul-volume", volumeTitle);
                const arrow = el("span", "panah-akordeon");
                const chapterList = el("div", "daftar-bab");

                header.appendChild(arrow);

                if (isSingleChapterVolume) {
                    volumeBox.classList.add("satu-bab");
                    arrow.style.display = "none";
                    header.dataset.indeksKonten = D.chapters.indexOf(chaptersInVolume[0]);
                    header.onclick = () => activateChap(+header.dataset.indeksKonten);
                    chapterList.style.display = "none";
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
                        } else {
                            chapterList.style.maxHeight = '0';
                        }
                    };
                }
                volumeBox.append(header, chapterList);
                D.sideNav.appendChild(volumeBox);
            }
        });
        updateNavUI();
    };

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

    const resetAppToInitialState = () => {
        toggleMainContentVisibility(false);
        D.gallery.innerHTML = "";
        D.mainContent.innerHTML = "";
        D.sideNav.innerHTML = "";
        D.mobVolNav.innerHTML = "";
        D.activeChapterIndex = -1;
        localStorage.removeItem(LAST_READ_KEY);
        delete D.gallery.dataset.volumeIndex;
    };

    const initInteractions = () => {
        D.closeModalBtn.onclick = hideChapModal;
        D.modalChap.onclick = e => {
            if (e.target === D.modalChap) hideChapModal();
        };

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
            closeBtn.onclick = resetAppToInitialState;
            D.navGalleryTop.appendChild(closeBtn);
        }

        D.gallery.onclick = e => {
            const imageElement = e.target.closest(".kartu-gambar img");
            if (!imageElement) return;

            const overlay = el("div", "kotak-cahaya");
            const fullImage = el("img");
            const fullResSrc = imageElement.dataset.fullres || imageElement.src;
            Object.assign(fullImage, { src: fullResSrc, alt: imageElement.alt });
            overlay.appendChild(fullImage);
            D.body.appendChild(overlay);
            overlay.onclick = () => overlay.remove();
        };

        const handleActionButtonClick = async (action) => {
            D.loadingOverlay.classList.remove("hidden");
            D.loadingOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            toggleMainContentVisibility(true);
            await initContent(action);
            D.loadingOverlay.classList.add("hidden");
        };

        if (D.tombolMulaiBaca) {
            D.tombolMulaiBaca.onclick = () => handleActionButtonClick(0);
        } else {
            console.warn("Elemen .tombol-mulai-baca tidak ditemukan.");
        }

        if (D.tombolVolumeTerbaru) {
            D.tombolVolumeTerbaru.onclick = () => handleActionButtonClick(-1);
        } else {
            console.warn("Elemen .tombol-volume-terbaru tidak ditemukan.");
        }

        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (!D.kontenBaca.classList.contains("konten-tersembunyi-awal")) {
                    buildNav();
                }
            }, 250);
        });
    };

    const initContent = async (initialChapterAction = null) => {
        D.seriesName = D.mainContent.dataset.label || ""; 

        await fetchFeed();

        if (D.feed.length === 0) {
            const errorMessage = `Tidak ada bab yang ditemukan untuk seri '${D.seriesName}' (pastikan label utama seri, label volume, dan label chapter sudah benar pada postingan).`;
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">${errorMessage}</p>`;
            console.warn(errorMessage);
            D.loadingOverlay.classList.add("hidden");
            return;
        }

        $$('.volume-bab', D.mainContent).forEach(volEl => volEl.remove());
        D.volumes = [];
        D.chapters = [];

        const volumesData = {}; 
        
        D.feed.forEach(entry => {
            const labels = entry.category?.map(c => c.term) || [];
            const volumeLabel = labels.find(l => l.toLowerCase().startsWith("volume "));
            const chapterLabel = labels.find(l => l.toLowerCase().startsWith("chapter "));

            if (volumeLabel && chapterLabel) {
                const volumeNumberMatch = volumeLabel.match(/\d+/);
                const volumeNumber = volumeNumberMatch ? parseInt(volumeNumberMatch[0]) : null;
                const chapterNumberMatch = chapterLabel.match(/\d+/);
                const chapterNumber = chapterNumberMatch ? parseInt(chapterNumberMatch[0]) : 1; 

                if (volumeNumber !== null) {
                    const volKey = `Volume ${volumeNumber}`;
                    if (!volumesData[volKey]) volumesData[volKey] = [];
                    volumesData[volKey].push({ entry: entry, order: chapterNumber });
                }
            }
        });

        const sortedVolumeKeys = Object.keys(volumesData).sort((a, b) => {
            return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
        });

        sortedVolumeKeys.forEach(volKey => {
            const volumeElement = el('div', 'volume-bab');
            volumeElement.dataset.volume = volKey;
            D.mainContent.appendChild(volumeElement);
            D.volumes.push(volumeElement);

            volumesData[volKey].sort((a, b) => a.order - b.order);

            volumesData[volKey].forEach(item => {
                const chapterElement = el('section', 'konten-bab');
                chapterElement.dataset.postId = item.entry.id.$t.split('.').pop();
                chapterElement.dataset.indeks = D.chapters.length;
                volumeElement.appendChild(chapterElement);
                D.chapters.push(chapterElement);
            });
        });

        if (D.chapters.length === 0) {
            const errorMessage = `Tidak ada bab yang ditemukan dalam seri '${D.seriesName}' setelah diproses (pastikan label volume/chapter sudah benar).`;
            D.mainContent.innerHTML = `<p style="color:red; text-align:center; padding:50px;">${errorMessage}</p>`;
            console.warn(errorMessage);
            D.loadingOverlay.classList.add("hidden");
            return;
        }

        let targetChapterIndex = 0;
        if (initialChapterAction === -1) {
            if (D.volumes.length > 0) {
                const latestVolume = D.volumes[D.volumes.length - 1];
                const chaptersInLatestVolume = $$("section.konten-bab", latestVolume);
                if (chaptersInLatestVolume.length > 0) {
                    targetChapterIndex = D.chapters.indexOf(chaptersInLatestVolume[0]);
                }
            }
        } else if (typeof initialChapterAction === 'number' && initialChapterAction >= 0) {
            targetChapterIndex = initialChapterAction;
        } else {
            targetChapterIndex = loadLastReadChapter();
        }

        await activateChap(targetChapterIndex, true);
        buildNav();
    };

    const initApp = () => {
        toggleMainContentVisibility(false);
        initInteractions();
    };

    initApp();
});
