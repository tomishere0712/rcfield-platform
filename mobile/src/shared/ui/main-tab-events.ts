type MainTabListener = (index: number) => void;
type TabBarVisibilityListener = (visible: boolean) => void;

const listeners = new Set<MainTabListener>();
const visibilityListeners = new Set<TabBarVisibilityListener>();

export function requestMainTab(index: number) {
  listeners.forEach((listener) => listener(index));
}

export function subscribeMainTabRequests(listener: MainTabListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTabBarVisibility(visible: boolean) {
  visibilityListeners.forEach((listener) => listener(visible));
}

export function subscribeTabBarVisibility(listener: TabBarVisibilityListener) {
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
  };
}

export function createScrollHandler() {
  let lastOffsetY = 0;
  return (event: any) => {
    const currentOffsetY = event.nativeEvent.contentOffset.y;
    const diff = currentOffsetY - lastOffsetY;
    
    // Chỉ ẩn khi đã cuộn qua 50px ở đầu trang
    if (currentOffsetY > 50) {
      if (diff > 12) {
        // Cuộn xuống -> Ẩn
        setTabBarVisibility(false);
      } else if (diff < -12) {
        // Cuộn lên -> Hiện
        setTabBarVisibility(true);
      }
    } else {
      // Ở đầu trang -> Luôn hiện
      setTabBarVisibility(true);
    }
    lastOffsetY = currentOffsetY;
  };
}
