document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".week-tab");
  const panels = document.querySelectorAll(".day-list");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const week = tab.dataset.week;

      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.weekPanel === week);
      });
    });
  });
});
