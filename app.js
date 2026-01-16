const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("pdf-input");
const pageIndicator = document.getElementById("page-indicator");
const prevButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");

const pageFrontCanvas = document.getElementById("page-front-canvas");
const pageBackCanvas = document.getElementById("page-back-canvas");
const pageFlipCanvas = document.getElementById("page-flip-canvas");
const pageFlip = document.getElementById("page-flip");

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";

const state = {
  pdf: null,
  pageCount: 0,
  currentPage: 1,
  isAnimating: false,
  drag: null,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateControls = () => {
  pageIndicator.textContent = `${state.pageCount ? state.currentPage : 0} / ${state.pageCount}`;
  prevButton.disabled = state.currentPage <= 1;
  nextButton.disabled = state.currentPage >= state.pageCount;
};

const renderPage = async (pageNumber, canvas) => {
  if (!state.pdf || pageNumber < 1 || pageNumber > state.pageCount) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.4 });
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;
};

const renderFlipbook = async () => {
  await renderPage(state.currentPage, pageFrontCanvas);
  await renderPage(state.currentPage + 1, pageBackCanvas);
  updateControls();
};

const loadPdf = async (file) => {
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();
  state.pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  state.pageCount = state.pdf.numPages;
  state.currentPage = 1;
  await renderFlipbook();
};

const setFlipOrigin = (direction) => {
  if (direction === "prev") {
    pageFlip.style.transformOrigin = "right center";
    pageFlip.style.transform = "rotateY(180deg)";
  } else {
    pageFlip.style.transformOrigin = "left center";
    pageFlip.style.transform = "rotateY(0deg)";
  }
};

const prepareFlip = async (direction) => {
  if (state.isAnimating || !state.pdf) return false;

  if (direction === "next" && state.currentPage >= state.pageCount) return false;
  if (direction === "prev" && state.currentPage <= 1) return false;

  state.isAnimating = true;
  pageFlip.classList.add("is-animating", "is-shadow");
  setFlipOrigin(direction);

  if (direction === "next") {
    await renderPage(state.currentPage, pageFlipCanvas);
  } else {
    await renderPage(state.currentPage - 1, pageFlipCanvas);
  }

  return true;
};

const finishFlip = async (direction, committed) => {
  pageFlip.classList.remove("is-dragging");
  pageFlip.classList.remove("is-shadow");

  if (committed) {
    state.currentPage += direction === "next" ? 1 : -1;
  }

  await renderFlipbook();
  pageFlip.style.transform = "rotateY(0deg)";
  state.isAnimating = false;
  pageFlip.classList.remove("is-animating");
};

const animateFlip = async (direction, committed) => {
  const targetRotation = direction === "next" ? (committed ? -180 : 0) : (committed ? 0 : 180);

  requestAnimationFrame(() => {
    pageFlip.style.transform = `rotateY(${targetRotation}deg)`;
  });

  const onTransitionEnd = async () => {
    pageFlip.removeEventListener("transitionend", onTransitionEnd);
    await finishFlip(direction, committed);
  };

  pageFlip.addEventListener("transitionend", onTransitionEnd);
};

const triggerFlip = async (direction) => {
  const prepared = await prepareFlip(direction);
  if (!prepared) return;

  animateFlip(direction, true);
};

const onPointerDown = async (event) => {
  if (!state.pdf || state.isAnimating) return;
  const rect = pageFlip.getBoundingClientRect();
  const isRight = event.clientX > rect.left + rect.width / 2;
  const direction = isRight ? "next" : "prev";

  const prepared = await prepareFlip(direction);
  if (!prepared) return;

  state.drag = {
    direction,
    startX: event.clientX,
    rotation: direction === "prev" ? 180 : 0,
  };

  pageFlip.classList.add("is-dragging");
  pageFlip.setPointerCapture(event.pointerId);
};

const onPointerMove = (event) => {
  if (!state.drag) return;

  const rect = pageFlip.getBoundingClientRect();
  const deltaX = event.clientX - state.drag.startX;

  if (state.drag.direction === "next") {
    const rotation = clamp((deltaX / rect.width) * 180, -180, 0);
    state.drag.rotation = rotation;
    pageFlip.style.transform = `rotateY(${rotation}deg)`;
  } else {
    const rotation = clamp(180 - (deltaX / rect.width) * 180, 0, 180);
    state.drag.rotation = rotation;
    pageFlip.style.transform = `rotateY(${rotation}deg)`;
  }
};

const onPointerUp = () => {
  if (!state.drag) return;

  const { direction, rotation } = state.drag;
  const committed = direction === "next" ? rotation < -90 : rotation < 90;

  pageFlip.classList.remove("is-dragging");
  state.drag = null;
  animateFlip(direction, committed);
};

const onDrop = (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");
  const file = event.dataTransfer.files[0];
  if (file && file.type === "application/pdf") {
    loadPdf(file);
  }
};

const onDragOver = (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
};

const onDragLeave = () => {
  dropzone.classList.remove("is-dragover");
};

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  loadPdf(file);
});

dropzone.addEventListener("drop", onDrop);

dropzone.addEventListener("dragover", onDragOver);

dropzone.addEventListener("dragleave", onDragLeave);

dropzone.addEventListener("pointerdown", onPointerDown);

dropzone.addEventListener("pointermove", onPointerMove);

dropzone.addEventListener("pointerup", onPointerUp);

dropzone.addEventListener("pointercancel", onPointerUp);

dropzone.addEventListener("click", (event) => {
  if (!state.pdf || state.isAnimating) return;
  const rect = pageFlip.getBoundingClientRect();
  const isRight = event.clientX > rect.left + rect.width / 2;
  triggerFlip(isRight ? "next" : "prev");
});

prevButton.addEventListener("click", () => triggerFlip("prev"));
nextButton.addEventListener("click", () => triggerFlip("next"));

updateControls();
