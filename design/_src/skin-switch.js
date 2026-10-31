// Skin toggle for studio artboards: gentle (brand) / flat (Gentle Shell terminal).
document.querySelectorAll(".skin-switch button").forEach((b) => {
  b.addEventListener("click", () => {
    document.documentElement.dataset.skin = b.dataset.skin;
    document.querySelectorAll(".skin-switch button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
});
