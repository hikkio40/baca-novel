document.addEventListener("DOMContentLoaded", async () => {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const el = (tag, cls = "", txt = "") => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  };

  const D = {
    appWrap: $(".pembungkus-aplikasi"),
    sideNav: $(".sisi-navigasi"),
    mainContent: $("main.konten-utama"),
    gallery: $(".galeri-utama"),
    galleryWrap: $(".wadah-galeri-dengan-tombol"),
    body: document.body,
    modalChap: $("#modalBab"),
    closeModalBtn: $(".tutup-modal"),
    modalVolTitle: $("#judulVolumeModal"),
    modalChapList: $("#daftarBabModal"),
    mobVolNav: $(".navigasi-volume-mobile"),
    chapters: [],
    volumes: [],
    feed: [],
    tombolMulaiBaca: $("#tombolMulaiBaca"),
    tombolVolumeTerbaru: $("#tombolVolumeTerbaru"),
    kontenBaca: $("#kontenBaca")
  };

  let isActivating = false;
  let preventScroll = false;
  const isMob = () => window.matchMedia("(max-width: 768px)").matches;

  const LAST_READ_KEY = "lastReadChapterIndex";
  const saveLastReadChapter = (index) => localStorage.setItem(LAST_READ_KEY, index.toString());
  const loadLastReadChapter = () => {
    const i = parseInt(localStorage.getItem(LAST_READ_KEY), 10);
    return (!isNaN(i) && i >= 0 && i < D.chapters.length) ? i : 0;
  };

  const scrollToMain = () => {
    if (preventScroll) return (preventScroll = false);
    const offsetTop = D.mainContent.getBoundingClientRect().top + window.pageYOffset;
    const gHeight = D.galleryWrap?.offsetHeight || 0;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spasi-besar"));
    window.scrollTo({ top: offsetTop - gHeight - gap, behavior: "smooth" });
  };

const getChapLabel = (title, labels, chapterCounter) => {
  const special = {
    prologue: "Prolog",
    interlude: "Interlude",
    bonus: "Bonus",
    epilogue: "Epilog",
    afterword: "Penutup"
  };

  const lowerLabels = Array.isArray(labels) ? labels.map(l => l.toLowerCase()) : [];
  const type = lowerLabels.find(l => special[l]);

  if (type) {
    return `${special[type]}: ${title || "Tanpa Judul"}`;
  } else if (lowerLabels.includes("chapter")) {
    return `Bab ${chapterCounter}: ${title || "Tanpa Judul"}`;
  } else {
    return title || "Tanpa Judul";
  }
};

  const fetchFeed = async () => {
    try {
      const res = await fetch("https://script.google.com/macros/s/AKfycbxcZd9hPNfu5wdLKrFM81-Kw4Fp1JSNp4R1fcf-fJako-pBOvXjSKp0hajj0KoAdNTXbA/exec?url=" +
        encodeURIComponent("https://etdsf.blogspot.com/feeds/posts/default?alt=json"));
      const data = await res.json();
      D.feed = data.feed.entry || [];
    } catch (e) {
      alert("Gagal memuat daftar cerita. Coba lagi nanti.");
    }
  };

  const loadChapContent = async (chapEl) => {
    if (chapEl.dataset.loaded) return;
    chapEl.innerHTML = `<p style="text-align:center; padding:20px; color:#888">Memuat konten...</p>`;
    const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chapEl.dataset.url);
    chapEl.innerHTML = entry ? `<h3>${entry.title.$t}</h3>${entry.content.$t}` :
      `<p style="color:red; padding:20px;">Konten tidak ditemukan.</p>`;
    chapEl.dataset.loaded = "true";
  };

  const updateActiveChapState = (idx) => {
    D.chapters.forEach((chap, i) => {
      const isActive = i === idx;
      chap.classList.toggle("aktif", isActive);
      $(`[data-indeks-konten="${i}"]`, D.sideNav)?.classList.toggle("aktif", isActive);
      $(`[data-indeks-konten="${i}"]`, D.modalChapList)?.classList.toggle("aktif", isActive);
      $(`[data-indeks-konten="${i}"]`, D.mobVolNav)?.classList.toggle("aktif", isActive);
    });
  };

  const buildGallery = (volIdx) => {
    D.gallery.innerHTML = "";
    D.gallery.dataset.volumeIndex = volIdx;
    const chapters = $$("section.konten-bab", D.volumes[volIdx]);
    chapters.forEach((chap, i) => {
      const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chap.dataset.url);
      const label = getChapLabel(entry?.title.$t || "", entry?.category?.map(c => c.term) || [], i);
      const badge = label.split(":")[0] || "Bab";
      $$("img", chap).filter(img => {
        const style = getComputedStyle(img);
        return style.display !== "none" || img.classList.contains("galeri-saja");
      }).forEach(img => {
        const card = el("div", "kartu-gambar");
        const lencana = el("div", `lencana-bab ${badge.toLowerCase().replace(/\s/g, "-")}`, badge);
        const clone = img.cloneNode(true);
        clone.style.display = "";
        card.append(lencana, clone);
        D.gallery.appendChild(card);
      });
    });
  };

  const activateChap = async (idx, scroll = true) => {
    if (isActivating || idx < 0 || idx >= D.chapters.length) return;
    isActivating = true;
    updateActiveChapState(idx);
    await loadChapContent(D.chapters[idx]);
    saveLastReadChapter(idx);
    if (scroll) scrollToMain();
    isActivating = false;
  };

  const showChapModal = (volIdx) => {
    const vol = D.volumes[volIdx];
    const chapters = $$("section.konten-bab", vol);
    if (chapters.length === 1) {
      activateChap(D.chapters.indexOf(chapters[0]), true);
      hideChapModal();
      buildGallery(volIdx);
      return;
    }

    D.modalVolTitle.textContent = vol.dataset.volume || `Volume ${volIdx + 1}`;
    D.modalChapList.innerHTML = "";
    chapters.forEach((chap, i) => {
      const idx = D.chapters.indexOf(chap);
      const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chap.dataset.url);
      const btn = el("div", chap.classList.contains("aktif") ? "aktif" : "", getChapLabel(entry?.title.$t || "", entry?.category?.map(c => c.term) || [], i));
      btn.dataset.indeksKonten = idx;
      btn.onclick = async () => {
        await activateChap(idx, true);
        hideChapModal();
        buildGallery(volIdx);
      };
      D.modalChapList.appendChild(btn);
    });
    D.modalChap.classList.add("aktif");
  };

  const hideChapModal = () => D.modalChap.classList.remove("aktif");

  const buildNav = () => {
    D.sideNav.innerHTML = '';
    D.mobVolNav.innerHTML = '';
    const isMobile = isMob();
    D.volumes.forEach((vol, vi) => {
      const chaps = $$("section.konten-bab", vol);
      const single = chaps.length === 1;
      const title = vol.dataset.volume || `Volume ${vi + 1}`;

      if (isMobile) {
        const btn = el("button", "tombol-volume", title);
        btn.dataset.volumeIndex = vi;
        if (single) {
          btn.classList.add("satu-bab");
          btn.dataset.indeksKonten = D.chapters.indexOf(chaps[0]);
          btn.onclick = () => {
            activateChap(+btn.dataset.indeksKonten, true);
            buildGallery(vi);
          };
        } else {
          btn.onclick = () => {
            $$(".tombol-volume", D.mobVolNav).forEach(b => b.classList.remove("aktif"));
            btn.classList.add("aktif");
            showChapModal(vi);
            buildGallery(vi);
          };
        }
        D.mobVolNav.appendChild(btn);
      } else {
        const box = el("div", "volume-bab");
        const header = el("div", "judul-volume", title);
        const arrow = el("span", "panah-akordeon");
        const list = el("div", "daftar-bab");

        header.appendChild(arrow);
        if (single) {
          box.classList.add("satu-bab");
          arrow.style.display = "none";
          header.dataset.indeksKonten = D.chapters.indexOf(chaps[0]);
          header.onclick = () => {
            activateChap(+header.dataset.indeksKonten, true);
            buildGallery(vi);
          };
          list.style.display = "none";
        } else {
          let chapterCounter = 1;
chaps.forEach((chap) => {
  const idx = D.chapters.indexOf(chap);
  const entry = D.feed.find(x => x.link.find(l => l.rel === "alternate")?.href === chap.dataset.url);
  const labels = entry?.category?.map(c => c.term) || [];
  const label = getChapLabel(entry?.title.$t || "", labels, chapterCounter);

  if (labels.map(l => l.toLowerCase()).includes("chapter")) {
    chapterCounter++;
  }

  const btn = el("div", "", label);
  btn.dataset.indeksKonten = idx;
  list.appendChild(btn);
});
          header.onclick = () => {
            const isOpen = box.classList.contains("terbuka");
            $$(".volume-bab", D.sideNav).forEach(v => v.classList.remove("terbuka"));
            if (!isOpen) {
              box.classList.add("terbuka");
              buildGallery(vi);
            }
          };
        }
        box.append(header, list);
        D.sideNav.appendChild(box);
      }
    });
  };

  const initInteractions = () => {
    D.sideNav.addEventListener("click", e => {
      const btn = e.target.closest("[data-indeks-konten]");
      if (btn && !isMob()) {
        const idx = +btn.dataset.indeksKonten;
        activateChap(idx, true);
        const volEl = D.chapters[idx].closest(".volume-bab");
        buildGallery(D.volumes.indexOf(volEl));
      }
    });

    D.mobVolNav.addEventListener("click", e => {
      const btn = e.target.closest(".tombol-volume");
      if (btn && isMob()) {
        const volIdx = +btn.dataset.volumeIndex;
        const chaps = $$("section.konten-bab", D.volumes[volIdx]);

        $$(".tombol-volume", D.mobVolNav).forEach(b => b.classList.remove("aktif"));
        btn.classList.add("aktif");

        if (chaps.length === 1) {
          activateChap(D.chapters.indexOf(chaps[0]), true);
          buildGallery(volIdx);
        } else {
          showChapModal(volIdx);
          buildGallery(volIdx);
        }
      }
    });

    D.closeModalBtn.onclick = hideChapModal;
    D.modalChap.onclick = e => { if (e.target === D.modalChap) hideChapModal(); };

    if (!$(".tombol-gulir.kiri", D.galleryWrap)) {
      ["⬅", "➡"].forEach((symbol, i) => {
        const btn = el("button", `tombol-gulir ${i ? "kanan" : "kiri"}`, symbol);
        btn.onclick = () => D.gallery.scrollBy({ left: (i ? 1 : -1) * 250, behavior: "smooth" });
        D.galleryWrap.appendChild(btn);
      });
    }

    D.gallery.onclick = e => {
      const img = e.target.closest(".kartu-gambar img");
      if (!img) return;
      const overlay = el("div", "kotak-cahaya");
      const clone = el("img");
      Object.assign(clone, { src: img.src, alt: img.alt });
      overlay.appendChild(clone);
      D.body.appendChild(overlay);
      overlay.onclick = () => overlay.remove();
    };

    let resizeT;
    window.addEventListener("resize", () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (!D.kontenBaca.classList.contains("konten-tersembunyi-awal")) {
          preventScroll = true;
          buildNav();
          if (D.chapters.length > 0) {
            let idx = D.chapters.findIndex(c => c.classList.contains("aktif"));
            if (idx === -1) idx = 0;
            activateChap(idx, false);
            const vol = D.chapters[idx].closest(".volume-bab");
            const vi = D.volumes.indexOf(vol);
            if (vi !== -1) {
              buildGallery(vi);
              const isSingle = $$("section.konten-bab", vol).length === 1;
              if (!isMob()) {
                const sideVol = $$(".volume-bab", D.sideNav)[vi];
                if (sideVol && !isSingle) sideVol.classList.add("terbuka");
              } else {
                const mobBtn = $$(".tombol-volume", D.mobVolNav)[vi];
                if (mobBtn) {
                  $$(".tombol-volume", D.mobVolNav).forEach(b => b.classList.remove("aktif"));
                  mobBtn.classList.add("aktif");
                }
              }
            }
          }
        }
      }, 250);
    });

    D.tombolMulaiBaca.onclick = async () => {
  D.kontenBaca.classList.remove("konten-tersembunyi-awal");
  D.modalChap.classList.remove("konten-tersembunyi-awal");
  D.tombolMulaiBaca.style.display = "none";
  D.tombolVolumeTerbaru.style.display = "none";
  await initContent();
  await activateChap(0, true); // Force to first chapter (index 0)
  const vol = D.chapters[0].closest(".volume-bab");
  const vi = D.volumes.indexOf(vol);
  if (vi !== -1) buildGallery(vi);
};

    D.tombolVolumeTerbaru.onclick = async () => {
      D.kontenBaca.classList.remove("konten-tersembunyi-awal");
      D.modalChap.classList.remove("konten-tersembunyi-awal");
      D.tombolMulaiBaca.style.display = "none";
      D.tombolVolumeTerbaru.style.display = "none";
      await initContent();
      const vi = D.volumes.length - 1;
      const chap = $$("section.konten-bab", D.volumes[vi])[0];
      if (chap) {
        await activateChap(D.chapters.indexOf(chap), true);
        buildGallery(vi);
      }
    };
  };

  const initContent = async () => {
    $$(".volume-bab").forEach((vol, vi) => {
      D.volumes[vi] = vol;
      $$("section.konten-bab", vol).forEach(chap => {
        chap.dataset.indeks = D.chapters.length;
        D.chapters.push(chap);
      });
    });

    await fetchFeed();
    preventScroll = true;
    buildNav();

    if (D.chapters.length > 0) {
      const idx = loadLastReadChapter();
      await activateChap(idx, false);
      const vol = D.chapters[idx].closest(".volume-bab");
      const vi = D.volumes.indexOf(vol);
      if (vi !== -1) {
        buildGallery(vi);
        const isSingle = $$("section.konten-bab", vol).length === 1;
        if (!isMob()) {
          const sideVol = $$(".volume-bab", D.sideNav)[vi];
          if (sideVol && !isSingle) sideVol.classList.add("terbuka");
        } else {
          const mobBtn = $$(".tombol-volume", D.mobVolNav)[vi];
          if (mobBtn) {
            $$(".tombol-volume", D.mobVolNav).forEach(b => b.classList.remove("aktif"));
            mobBtn.classList.add("aktif");
          }
        }
      }
      scrollToMain();
    }
  };

  const initApp = () => {
    D.kontenBaca.classList.add("konten-tersembunyi-awal");
    D.modalChap.classList.add("konten-tersembunyi-awal");
    D.tombolMulaiBaca.style.display = "block";
    D.tombolVolumeTerbaru.style.display = "block";
    initInteractions();
  };

  initApp();
});
