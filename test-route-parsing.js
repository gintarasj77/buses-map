async function testRouteParsing() {
  try {
    console.log('Fetching route...');
    const response = await fetch('https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt');
    const text = await response.text();
    
    console.log('Raw file size:', text.length, 'bytes');
    console.log('First 300 chars:', text.substring(0, 300));
    
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);
    console.log('Total non-empty lines:', lines.length);
    
    let abPolyline = '';
    let baPolyline = '';
    let mode = '';
    
    for (const line of lines) {
      if (line === 'a-b') {
        console.log('Found a-b marker');
        mode = 'ab';
      } else if (line === 'b-a') {
        console.log('Found b-a marker');
        mode = 'ba';
      } else if (mode === 'ab' && !abPolyline && line && !line.match(/^B+$/)) {
        console.log('Setting ab polyline, length:', line.length);
        abPolyline = line;
        mode = '';
      } else if (mode === 'ba' && !baPolyline && line && !line.match(/^B+$/)) {
        console.log('Setting ba polyline, length:', line.length);
        baPolyline = line;
        mode = '';
      }
    }
    
    console.log('ab polyline length:', abPolyline.length);
    console.log('ba polyline length:', baPolyline.length);
    
    // Test decode
    function decodePolyline(encoded) {
      const points = [];
      let index = 0, lat = 0, lng = 0;
      while (index < encoded.length) {
        let result = 0, shift = 0, c;
        do {
          c = encoded.charCodeAt(index++) - 63;
          result |= (c & 0x1f) << shift;
          shift += 5;
        } while (c >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : result >> 1;
        result = 0; shift = 0;
        do {
          c = encoded.charCodeAt(index++) - 63;
          result |= (c & 0x1f) << shift;
          shift += 5;
        } while (c >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : result >> 1;
        points.push([lat / 1e5, lng / 1e5]);
      }
      return points;
    }
    
    const abCoords = abPolyline ? decodePolyline(abPolyline) : [];
    const baCoords = baPolyline ? decodePolyline(baPolyline) : [];
    
    console.log('ab coords:', abCoords.length, 'points');
    if (abCoords.length > 0) {
      console.log('  First 3 ab points:', abCoords.slice(0, 3));
      console.log('  Last 3 ab points:', abCoords.slice(-3));
    }
    
    console.log('ba coords:', baCoords.length, 'points');
    if (baCoords.length > 0) {
      console.log('  First 3 ba points:', baCoords.slice(0, 3));
      console.log('  Last 3 ba points:', baCoords.slice(-3));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testRouteParsing();
