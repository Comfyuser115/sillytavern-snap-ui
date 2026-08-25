import { mountSnapOverlay } from "./ui/chatList.js";

jQuery(() => {
  mountSnapOverlay();
  console.log(
    "[snap-view] Loaded. Click the camera bubble (bottom-right) to open your chat list.",
  );
});
