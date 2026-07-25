import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage';
import HomePage from './pages/HomePage';
import { Info, X, Download } from 'lucide-react';
import './index.css';

function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Ngăn Chrome tự động hiện mini-infobar
      e.preventDefault();
      // Lưu trữ event để kích hoạt sau
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert("Để cài đặt trên iPhone: Chọn nút Chia sẻ (Share) -> Thêm vào MH chính (Add to Home Screen).");
    }
  };

  return (
    <Router>
      <div className="app-wrapper">
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/home" element={<HomePage />} />
          </Routes>
          
          {/* Intro Popup */}
          {showIntro && (
            <div className="animate-fade-in" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
              <div style={{ background: 'white', width: '100%', borderRadius: '24px', padding: '20px', position: 'relative', boxShadow: '0 24px 48px rgba(0,0,0,0.2)', margin: 'auto' }}>
                <button onClick={() => setShowIntro(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: '#f5f5f5', border: 'none', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} color="#666" />
                </button>
                <h1 style={{ fontSize: '36px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="brand-text-gradient"><span className="highlight-v">V</span>ibely</div> 💖
                </h1>
                <p style={{ color: '#666', lineHeight: '1.5', marginBottom: '16px', fontSize: '13px' }}>
                  Ứng dụng nhắn tin bảo mật siêu tốc dành riêng cho các cặp đôi. Không cần email, số điện thoại. Kết nối 1-1 riêng tư 100%.
                </p>
                
                <div style={{ background: '#fff0f5', padding: '16px', borderRadius: '16px', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--primary-color)' }}>
                    Tính năng phiên bản mới nhất (25/07/2026 23:30)
                  </h3>
                  <ul style={{ color: '#555', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <li>🔒 Đăng nhập bằng <b>Ảnh Chìa Khóa</b> (QR).</li>
                    <li>🤝 <b>Hòm thư kết nối</b> siêu tốc 1 chạm.</li>
                    <li>💬 Giao diện <b>News Feed</b> với hiệu ứng làm mờ tin nhắn cũ, Focus tin nhắn mới.</li>
                    <li>💔 Tích hợp tính năng <b>Ngắt kết nối</b> dứt khoát.</li>
                    <li>🛡️ Update thêm <b>tính năng bảo mật</b> và kết nối.</li>
                    <li>✨ cập nhập lại giao diện mới có thể kết bạn với nhiều người lột xác giao diện mới</li>
                  </ul>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button className="btn-primary" onClick={() => setShowIntro(false)} style={{ width: '100%', padding: '14px', borderRadius: '16px', fontSize: '16px', fontWeight: 'bold' }}>
                    Bắt đầu ngay
                  </button>
                  <button 
                    onClick={handleInstallClick}
                    style={{ width: '100%', padding: '14px', borderRadius: '16px', fontSize: '15px', fontWeight: 'bold', background: '#ffe5e5', color: 'var(--primary-color)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <Download size={18} /> Tải Vibely về điện thoại
                  </button>
                  <p style={{ textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '8px' }}>
                    Bản quyền © by Hiếu Phạm (Bonnie)
                  </p>
                </div>
              </div>
            </div>
          )}
      </div>
    </Router>
  );
}

export default App;
