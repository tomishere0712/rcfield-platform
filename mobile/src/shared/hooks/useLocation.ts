import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import type { UserLocation } from '@/features/explore/types/explore.types';

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Quyền truy cập vị trí bị từ chối.');
        setLoading(false);
        return null;
      }

      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const loc: UserLocation = {
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
      };
      setLocation(loc);
      setLoading(false);
      return loc;
    } catch (error: any) {
      setErrorMsg(error.message || 'Không thể lấy vị trí hiện tại.');
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    // Tự động xin quyền và lấy vị trí lần đầu
    requestLocation();
  }, []);

  return {
    location,
    errorMsg,
    loading,
    requestLocation,
    setLocation,
  };
}
