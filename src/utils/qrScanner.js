import jsQR from 'jsqr';

export const scanQRCodeFromFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize image if too large to prevent performance issues
        const MAX_WIDTH = 1000;
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // Ngăn làm mờ mã QR khi resize
        ctx.drawImage(img, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        
        if (code) {
          resolve(code.data);
        } else {
          // Try with inversion for dark mode QR codes
          const invertedCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "invertFirst",
          });
          if (invertedCode) {
            resolve(invertedCode.data);
          } else {
            resolve(null);
          }
        }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
