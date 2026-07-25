import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { Send, Heart, LogOut, Settings, X, Image as ImageIcon, Loader2, UserMinus } from 'lucide-react';
import { scanQRCodeFromFile } from '../utils/qrScanner';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';

export default function HomePage() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  
  const [loadingUser, setLoadingUser] = useState(true);
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [inboxRequests, setInboxRequests] = useState([]);

  // Connection State
  const isConnected = userData?.partnerId && partnerData?.partnerId === userId;
  const channelId = isConnected ? [userId, userData.partnerId].sort().join('_') : null;

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [tempName, setTempName] = useState('');
  const qrRef = useRef(null);

  // Chat State
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [latestMsgObj, setLatestMsgObj] = useState(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [myLastMsgObj, setMyLastMsgObj] = useState(null);
  const [savingQr, setSavingQr] = useState(false);

  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }

    // Subscribe to my user doc
    const userRef = doc(db, 'users', userId);
    
    // Ensure doc exists
    setDoc(userRef, { id: userId }, { merge: true });

    const unsubUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        if (!tempName) setTempName(data.name || '');
      }
      setLoadingUser(false);
    });

    return () => unsubUser();
  }, [userId, navigate]);

  useEffect(() => {
    if (userData?.partnerId) {
      const partnerRef = doc(db, 'users', userData.partnerId);
      const unsubPartner = onSnapshot(partnerRef, (docSnap) => {
        if (docSnap.exists()) {
          setPartnerData(docSnap.data());
        } else {
          setPartnerData(null);
        }
      });
      return () => unsubPartner();
    } else {
      setPartnerData(null);
    }
  }, [userData?.partnerId]);

  // Listen for connection requests (Inbox)
  useEffect(() => {
    if (!userId) return;
    
    // Tìm những người đang có partnerId trỏ tới mình
    const q = query(collection(db, 'users'), where('partnerId', '==', userId));
    const unsub = onSnapshot(q, (snapshot) => {
      const requests = [];
      snapshot.forEach(docSnap => {
        // Chỉ hiện request nếu mình CHƯA kết nối thành công với họ
        if (userData?.partnerId !== docSnap.id) {
          requests.push({ id: docSnap.id, ...docSnap.data() });
        }
      });
      setInboxRequests(requests);
    });
    return () => unsub();
  }, [userId, userData?.partnerId]);

  useEffect(() => {
    if (isConnected && channelId) {
      const q = query(
        collection(db, 'messages', channelId, 'msgs'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        let msgsArray = [];
        let latestPartnerMsg = null;
        let latestMyMsg = null;

        snapshot.docs.forEach(docSnap => {
          const msg = { id: docSnap.id, ...docSnap.data() };
          msgsArray.push(msg);
          
          if (msg.senderId !== userId && !latestPartnerMsg) {
            latestPartnerMsg = msg;
          }
          if (msg.senderId === userId && !latestMyMsg) {
            latestMyMsg = msg;
          }
        });

        setMessages(msgsArray);
        setLatestMsgObj(msgsArray[0] || null);

        if (latestPartnerMsg && !latestPartnerMsg.read) {
          updateDoc(doc(db, 'messages', channelId, 'msgs', latestPartnerMsg.id), {
            read: true
          });
        }

        if (latestMyMsg) {
          setMyLastMsgObj(latestMyMsg);
        }

        setLoadingChat(false);
      });
      return () => unsub();
    } else {
      setLoadingChat(false);
      setMessages([]);
    }
  }, [isConnected, channelId, userId]);

  const handleScanPartner = async (e) => {
    const file = e.target.files[0];
    // Reset để có thể chọn lại chính xác ảnh này lần sau
    e.target.value = null;
    
    if (!file) return;
    
    try {
      const result = await scanQRCodeFromFile(file);
      if (result) {
        if (result === userId) {
          alert("Đây là mã của bạn! Bạn cần quét ảnh thẻ của người yêu.");
          return;
        }
        await updateDoc(doc(db, 'users', userId), {
          partnerId: result
        });
        alert(`Đã gửi yêu cầu kết nối tới ${result}! Hãy bảo người ấy mở Hộp Thư để xác nhận nhé.`);
      } else {
        alert("Không tìm thấy Mã QR trong ảnh! Hãy chắc chắn bạn quét đúng ảnh thẻ Tài Khoản.");
      }
    } catch (err) {
      alert("Lỗi khi đọc ảnh hoặc lỗi mạng.");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !isConnected) return;

    try {
      await addDoc(collection(db, 'messages', channelId, 'msgs'), {
        text: message,
        createdAt: serverTimestamp(),
        senderId: userId,
        senderName: userData?.name || 'Vô danh',
        read: false
      });
      setMessage('');
    } catch (err) {
      console.error(err);
      alert("Không thể gửi tin nhắn.");
    }
  };

  const handleSaveSettings = async () => {
    await updateDoc(doc(db, 'users', userId), {
      name: tempName
    });
    setShowSettings(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    navigate('/');
  };

  const handleUnfriend = async () => {
    if (window.confirm("Bạn có chắc chắn muốn ngắt kết nối với người này không? Mọi thứ sẽ trở về trạng thái chưa kết nối.")) {
      try {
        if (userData?.partnerId) {
          // Xóa kết nối từ phía người yêu (để họ không tự động gửi request lại cho mình)
          await updateDoc(doc(db, 'users', userData.partnerId), {
            partnerId: null
          }).catch(() => {});
        }
        // Xóa kết nối từ phía mình
        await updateDoc(doc(db, 'users', userId), {
          partnerId: null
        });
        setShowSettings(false);
      } catch (err) {
        alert("Lỗi khi ngắt kết nối.");
      }
    }
  };

  const handleDownloadQr = async () => {
    if (!qrRef.current) return;
    setSavingQr(true);
    try {
      const canvas = await html2canvas(qrRef.current, { scale: 3, backgroundColor: null });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = image;
      link.download = `love-key-${userId}.png`;
      link.click();
    } catch (err) {
      alert("Lỗi khi lưu ảnh");
    } finally {
      setSavingQr(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + 
           date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  if (loadingUser) return <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center' }}>Đang tải...</div>;

  return (
    <div className="page-container" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', zIndex: 50, position: 'relative' }}>
        <button 
          onClick={() => setShowSettings(true)}
          style={{ position: 'relative', zIndex: 50, background: 'white', border: 'none', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
          <Settings size={24} color="var(--primary-color)" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <h2 className="brand-text" style={{ fontSize: '28px' }}><span className="highlight-v">V</span>ibe</h2>
        </div>
        <div style={{ width: '48px' }}></div> {/* Spacer for centering */}
      </div>
      
      <div style={{ textAlign: 'center', marginBottom: '16px', zIndex: 10 }}>
        {isConnected ? (
          <span style={{ background: '#34c759', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            Đã kết nối với {partnerData?.name || userData?.partnerId}
          </span>
        ) : (
          <span style={{ background: '#ff9500', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            Chưa kết nối
          </span>
        )}
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', overflowY: 'auto', gap: '24px', paddingBottom: '32px' }}>
        
        {!userData?.partnerId ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Hộp thư đến */}
            {inboxRequests.length > 0 && (
              <div className="animate-fade-in" style={{ width: '100%' }}>
                <h3 style={{ fontSize: '16px', color: '#ff3b30', marginBottom: '12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📬 Có {inboxRequests.length} yêu cầu kết nối!
                </h3>
                {inboxRequests.map(req => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '8px', boxShadow: '0 4px 12px rgba(255,59,48,0.15)', border: '2px solid rgba(255,59,48,0.2)' }}>
                    <div>
                      <strong style={{ fontSize: '16px', color: '#333' }}>{req.name || 'Người dùng ẩn danh'}</strong>
                      <div style={{ fontSize: '12px', color: '#888' }}>ID: {req.id}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'users', userId), { partnerId: req.id });
                        } catch (err) {
                          alert("Có lỗi xảy ra, thử lại sau.");
                        }
                      }}
                      style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,75,130,0.3)' }}>
                      Chấp nhận
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="animate-fade-in glass-panel" style={{ width: '100%', padding: '32px 24px', textAlign: 'center', borderRadius: '32px' }}>
              <Heart size={48} color="var(--primary-color)" fill="var(--primary-color)" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>Chủ động kết nối</h2>
              <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>Hoặc bạn có thể chủ động xin ảnh thẻ chìa khóa của người ấy và quét tại đây.</p>
              
              <div style={{ position: 'relative', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleScanPartner}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
                />
                <button style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '2px dashed var(--primary-color)', background: 'rgba(255,255,255,0.5)', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <ImageIcon size={20} /> Quét Ảnh Chìa Khóa
                </button>
              </div>
            </div>
          </div>
        ) : !isConnected ? (
          <div className="animate-fade-in glass-panel" style={{ width: '100%', padding: '32px 24px', textAlign: 'center', borderRadius: '32px' }}>
            <Loader2 size={48} color="var(--primary-color)" className="animate-spin" style={{ marginBottom: '16px', animation: 'spin 2s linear infinite' }} />
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>Đang đợi kết nối...</h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>
              Bạn đã chọn kết nối với {userData.partnerId}.<br/><br/>
              Hãy bảo người ấy mở ứng dụng và <b>Quét Ảnh Chìa Khóa Của Bạn</b> để hoàn tất kết nối nhé!
            </p>
            <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '12px', fontSize: '12px', color: '#888', textAlign: 'left' }}>
              <b>🛠 Debug Info:</b><br/>
              - ID của bạn: <b>{userId}</b><br/>
              - Bạn đang chờ: <b>{userData.partnerId}</b><br/>
              - Trạng thái của {userData.partnerId}: <b>{partnerData ? (partnerData.partnerId ? (partnerData.partnerId === userId ? `Đã quét bạn (Đáng lẽ phải kết nối rồi!)` : `Đang quét sai mã: ${partnerData.partnerId}`) : "Chưa quét mã của bạn") : "Đang lấy dữ liệu..."}</b>
            </div>
          </div>
        ) : (
          /* News Feed */
          loadingChat ? (
             <div style={{ color: '#888', margin: 'auto' }}>Đang tải...</div>
          ) : messages.length === 0 ? (
            <div className="glass-panel" style={{ width: '100%', aspectRatio: '1/1', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px', textAlign: 'center', borderRadius: '36px', boxShadow: '0 24px 48px rgba(0,0,0,0.1)' }}>
              <Heart size={48} color="var(--primary-color)" fill="var(--primary-color)" style={{ opacity: 0.2, position: 'absolute', top: '32px', right: '32px' }} />
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#999', lineHeight: '1.4' }}>
                Phòng đã mở! Hãy gửi lời yêu thương đầu tiên đi!
              </h1>
            </div>
          ) : (
            messages.map((msgObj, index) => (
              <div key={msgObj.id} className="msg-card glass-panel" style={{
                '--default-opacity': index === 0 ? 1 : 0.6,
                '--default-scale': index === 0 ? 1 : 0.95,
                width: '100%',
                aspectRatio: '1/1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '32px',
                textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6))',
                borderRadius: '36px',
                boxShadow: '0 24px 48px rgba(0,0,0,0.1)',
                flexShrink: 0
              }}>
                <Heart size={48} color="var(--primary-color)" fill="var(--primary-color)" style={{ opacity: 0.2, position: 'absolute', top: '32px', right: '32px' }} />
                <p style={{ marginBottom: '24px', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Từ {msgObj.senderId === userId ? 'bạn' : (msgObj.senderName || 'người ấy')} ❤️
                </p>
                <h1 style={{ 
                  fontSize: '28px', 
                  fontWeight: '700', 
                  color: 'var(--text-dark)', 
                  lineHeight: '1.4',
                  wordBreak: 'break-word',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  "{msgObj.text}"
                </h1>
                
                {msgObj.createdAt && (
                  <div style={{ marginTop: 'auto', paddingTop: '16px', color: '#999', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {formatTime(msgObj.createdAt)}
                  </div>
                )}
              </div>
            ))
          )
        )}
      </div>

      {/* Input Area (only if connected) */}
      {isConnected && (
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '12px', zIndex: 10 }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Gửi lời yêu thương..."
            style={{ flex: 1, padding: '16px 20px', borderRadius: '24px', border: 'none', background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: '15px', outline: 'none' }}
          />
          <button 
            type="submit" 
            disabled={!message.trim()}
            style={{ width: '54px', height: '54px', borderRadius: '24px', border: 'none', background: message.trim() ? 'var(--primary-color)' : '#ccc', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: message.trim() ? 'pointer' : 'default', boxShadow: message.trim() ? '0 8px 24px rgba(255,75,130,0.3)' : 'none', transition: 'all 0.3s' }}>
            <Send size={20} style={{ marginLeft: '4px' }} />
          </button>
        </form>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '32px', padding: '32px', position: 'relative' }}>
            <button onClick={() => setShowSettings(false)} style={{ position: 'absolute', top: '24px', right: '24px', background: '#f5f5f5', border: 'none', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={20} color="#666" />
            </button>
            
            <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Cài Đặt Tài Khoản</h3>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>TÊN HIỂN THỊ CỦA BẠN</label>
              <input 
                type="text" 
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="VD: Hieu, Vy..."
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '16px', fontWeight: 'bold' }}>ẢNH CHÌA KHÓA CỦA BẠN</label>
              
              <div 
                ref={qrRef}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 75, 130, 0.95) 0%, rgba(255, 143, 163, 0.95) 100%)',
                  padding: '24px',
                  borderRadius: '24px',
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginBottom: '16px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', filter: 'blur(10px)' }}></div>
                <h4 className="brand-text" style={{ marginBottom: '12px', fontSize: '18px', zIndex: 1 }}><span className="highlight-v">V</span>ibe</h4>
                <div style={{ background: 'white', padding: '12px', borderRadius: '12px', zIndex: 1 }}>
                  <QRCodeCanvas value={userId} size={120} level="H" fgColor="#333333" includeMargin={true} />
                </div>
                <p style={{ color: 'white', marginTop: '12px', fontWeight: 'bold', letterSpacing: '1px', zIndex: 1 }}>{userId}</p>
              </div>
              
              <button onClick={handleDownloadQr} disabled={savingQr} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid var(--primary-color)', background: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                {savingQr ? 'Đang lưu...' : 'Lưu Lại Ảnh Này'}
              </button>
            </div>
            
            <button className="btn-primary" onClick={handleSaveSettings} style={{ width: '100%', padding: '16px', borderRadius: '16px', marginBottom: '16px' }}>
              Lưu Cài Đặt
            </button>
            
            {userData?.partnerId && (
              <button onClick={handleUnfriend} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#fff0f0', color: '#ff3b30', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
                <UserMinus size={20} /> Hủy Kết Nối (Xóa Bạn)
              </button>
            )}
            
            <button onClick={handleLogout} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#f5f5f5', color: '#666', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
              <LogOut size={20} /> Đăng Xuất (Thoát App)
            </button>
            
          </div>
        </div>
      )}
    </div>
  );
}
