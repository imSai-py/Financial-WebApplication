/**
 * Dual-fallback Indian Pincode Lookup Service
 * Resolves 6-digit Indian PIN code to City and State.
 */
export async function lookupPincode(pincode) {
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return null;
  }

  // 1. Try postalpincode.in first (highly accurate, district-level accuracy)
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
        const po = data[0].PostOffice[0];
        return {
          city: po.District || po.Division || po.Circle || '',
          state: po.State || '',
        };
      }
    }
  } catch (error) {
    console.warn('postalpincode.in failed, trying fallback api.zippopotam.us:', error);
  }

  // 2. Fallback to api.zippopotam.us
  try {
    const response = await fetch(`https://api.zippopotam.us/in/${pincode}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.places && data.places.length > 0) {
        const place = data.places[0];
        const rawPlaceName = place['place name'] || '';
        
        // Clean place name to get a clean city name.
        // Common suffixes in Indian post office names: G.P.O., S.O., B.O., H.O., Central, etc.
        let city = rawPlaceName
          .replace(/\s+(G\.P\.O\.|S\.O|B\.O|G\.P\.O|H\.O|Central|Branch Office|Sub Office|Head Office).*$/i, '')
          .trim();
        
        if (!city) {
          city = rawPlaceName.trim();
        }

        return {
          city: city,
          state: place['state'] || '',
        };
      }
    }
  } catch (error) {
    console.error('All pincode lookup services failed:', error);
  }

  return null;
}
