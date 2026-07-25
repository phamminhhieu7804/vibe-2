import { useNavigate } from 'react-router-dom';
import { Heart, Upload, Image as ImageIcon, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { scanQRCodeFromFile } from '../utils/qrScanner';

export default function WelcomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // States for creating new account
  const [isCreating, setIsCreating] = useState(false);
  const [customId, setCustomId] = useState('');
  const [createdId, setCreatedId] = useState(null);
  const [accountMode, setAccountMode] = useState('couple'); // couple, friends, both
  const cardRef = useRef(null);

  useEffect(() => {
    // If logged in, go straight to home
    const userId = localStorage.getItem('userId');
    if (userId) {
      navigate('/home');
    }
  }, [navigate]);

  const handleCreateNew = async () => {
    if (!customId || customId.length < 3) {
      setError("Mã phải có ít nhất 3 ký tự!");
      return;
    }
    const cleanId = customId.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // Set created ID to show the download card
    setCreatedId(cleanId);
    localStorage.setItem('pendingAccountMode', accountMode); // Lưu tạm chế độ
    setError(null);
  };

  const handleDownloadAndLogin = async () => {
    if (!cardRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: null,
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = image;
      link.download = `love-key-${createdId}.png`;
      link.click();
      
      // Quay lại màn hình đăng nhập
      setTimeout(() => {
        setCreatedId(null);
        setIsCreating(false);
        setCustomId('');
      }, 500);
    } catch (err) {
      console.error(err);
      setError("Không thể tạo ảnh, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = null; // Reset để có thể chọn lại ảnh cũ
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const result = await scanQRCodeFromFile(file);
      if (result) {
        if (result.startsWith('VIBE-')) {
          setError("Đây là Mã Kết Bạn, không thể dùng để đăng nhập! Vui lòng chọn Ảnh Chìa Khóa bảo mật (Màu Đỏ).");
          return;
        }
        localStorage.setItem('userId', result);
        navigate('/home');
      } else {
        setError("Không tìm thấy Mã QR trong ảnh! Hãy chọn đúng bức ảnh thẻ kết nối nhé.");
      }
    } catch (err) {
      console.error(err);
      setError("Lỗi khi đọc ảnh.");
    } finally {
      setLoading(false);
    }
  };

  if (createdId) {
    return (
      <div className="page-container" style={{ alignItems: 'center' }}>
        <div style={{ margin: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={() => setCreatedId(null)} style={{ background: 'none', border: 'none', color: '#666', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', alignSelf: 'flex-start', fontWeight: 'bold' }}>
            <ArrowLeft size={20} /> Quay lại
          </button>
          
          <h2 style={{ marginBottom: '24px', fontSize: '24px', textAlign: 'center' }}>Lưu Tài Khoản Của Bạn</h2>
          
          {/* Connection Card with QR */}
          <div 
            ref={cardRef}
            className="glass-panel"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(255, 75, 130, 0.95) 0%, rgba(255, 143, 163, 0.95) 100%)',
              color: 'white',
              borderRadius: '24px',
              boxShadow: '0 20px 40px rgba(255, 75, 130, 0.3)',
              marginBottom: '32px',
              width: '100%',
              maxWidth: '350px',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', filter: 'blur(20px)' }}></div>
            <Heart size={48} color="white" fill="white" style={{ marginBottom: '16px', zIndex: 1, flexShrink: 0 }} />
          <h3 className="brand-text" style={{ fontSize: '24px', marginBottom: '8px', zIndex: 1 }}><span className="highlight-v">V</span>ibely</h3>
          <p style={{ opacity: 0.9, marginBottom: '24px', fontSize: '14px', textAlign: 'center', zIndex: 1, fontWeight: 'bold', textTransform: 'uppercase' }}>TÀI KHOẢN ĐĂNG NHẬP</p>
          
          <div style={{ background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '16px', zIndex: 1 }}>
             <QRCodeCanvas value={createdId} size={150} level="H" fgColor="#333333" includeMargin={true} />
          </div>
          
          <p style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '2px', zIndex: 1, flexShrink: 0 }}>{createdId}</p>
        </div>

        <button className="btn-primary" onClick={handleDownloadAndLogin} disabled={loading} style={{ width: '100%', maxWidth: '350px', padding: '16px', flexShrink: 0 }}>
          {loading ? 'Đang lưu...' : 'Tải Ảnh & Quay Lại Đăng Nhập'}
        </button>
        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#888', flexShrink: 0 }}>
          Bức ảnh này chính là Tài Khoản của bạn.<br/><b>TUYỆT ĐỐI KHÔNG CHIA SẺ CHO AI</b>. Chỉ dùng để khôi phục tài khoản.
        </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ alignItems: 'center', paddingBottom: '40px' }}>
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', margin: '8vh auto auto auto' }}>
        
        <div className="animate-heart-bounce" style={{ width: '80px', height: '80px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px rgba(255, 75, 130, 0.2)', flexShrink: 0, marginBottom: '8px' }}>
          <Heart size={40} color="var(--primary-color)" fill="var(--primary-color)" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h1 className="brand-text" style={{ fontSize: '36px', marginBottom: '8px' }}><span className="highlight-v">V</span>ibely</h1>
        </div>

        {error && (
          <div style={{ background: '#ffe5e5', color: '#ff3b30', padding: '12px', borderRadius: '12px', width: '100%', textAlign: 'center', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {/* Action Blocks */}
        {isCreating ? (
           <div className="animate-fade-in" style={{ background: 'rgba(255,255,255,0.7)', padding: '24px', borderRadius: '24px', width: '100%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.5)' }}>
             <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Tạo Định Danh Mới</p>
             <input 
               type="text" 
               placeholder="Nhập ID (VD: HIEU-123)"
               value={customId}
               onChange={(e) => setCustomId(e.target.value)}
               style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #ddd', fontSize: '16px', textAlign: 'center', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }}
             />
             


             <button className="btn-primary" onClick={handleCreateNew} style={{ width: '100%', padding: '16px', borderRadius: '16px' }}>
               Tiếp tục
             </button>
             <button onClick={() => setIsCreating(false)} style={{ background: 'none', border: 'none', color: '#666', marginTop: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Hủy</button>
           </div>
        ) : (
          <div className="animate-fade-in" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <button className="btn-primary" onClick={() => setIsCreating(true)} style={{ padding: '16px', borderRadius: '16px', fontSize: '16px', width: '100%' }}>
              Tạo Tài Khoản Mới
            </button>
            
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload}
                disabled={loading}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
              />
              <button style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '2px dashed var(--primary-color)', background: 'rgba(255,255,255,0.5)', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {loading ? 'Đang quét...' : <><ImageIcon size={20} /> Tôi đã có Ảnh Tài Khoản</>}
              </button>
            </div>
            
            <p style={{ color: '#666', lineHeight: '1.5', fontSize: '14px', textAlign: 'center', marginTop: '16px' }}>Đăng nhập siêu bảo mật bằng Mã QR.</p>
            
            {/* Fallback Đăng nhập thủ công */}
            <div style={{ marginTop: '16px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.5)', width: '100%', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px', fontWeight: 'bold' }}>Hoặc nhập mã thủ công nếu quét ảnh bị lỗi:</p>
              <input 
                type="text" 
                placeholder="Nhập mã (VD: HIEU-123)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                     const val = e.target.value.trim().toUpperCase();
                     if (val.length > 2) {
                       localStorage.setItem('userId', val);
                       navigate('/home');
                     } else {
                       setError('Mã đăng nhập phải trên 3 ký tự!');
                     }
                  }
                }}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #ddd', fontSize: '16px', textAlign: 'center', outline: 'none', background: 'rgba(255,255,255,0.7)' }}
              />
              <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>Nhập mã và nhấn Enter để vào ngay</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
