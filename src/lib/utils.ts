import { createCn } from "cn/config"

// Custom font sizes and radii from globals.css. Without them the merger takes
// `text-title` for a color and drops a real color class next to it.
export const cn = createCn({
  extend: {
    theme: {
      text: ["logo", "logo-lg", "title", "title-lg", "heading", "heading-lg"],
      radius: ["section", "section-lg", "card", "card-lg", "panel", "panel-lg", "field"],
    },
  },
})
