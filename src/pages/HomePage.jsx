import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove, getDocs } from 'firebase/firestore';
import { Send, Heart, LogOut, Settings, X, Image as ImageIcon, UserMinus, Users, ArrowLeft, Check, Lock } from 'lucide-react';
import { scanQRCodeFromFile } from '../utils/qrScanner';
import { QRCodeCanvas } from 'qrcode.react';
import html2canvas from 'html2canvas';

export default function HomePage() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  
  const [loadingUser, setLoadingUser] = useState(true);
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [friendsData, setFriendsData] = useState([]);

  // Connection State
  const isConnected = !!(userData?.partnerId || (userData?.friends && userData.friends.length > 0));

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); // 'main' or 'profile'
  const [tempName, setTempName] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempMode, setTempMode] = useState('couple');
  const [openFriendMenu, setOpenFriendMenu] = useState(null);
  const [openLoverMenu, setOpenLoverMenu] = useState(false);
  const qrRefFriend = useRef(null);
  const qrRefLover = useRef(null);

  // Chat State
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [savingQr, setSavingQr] = useState(false);
  
  // Feed UI State
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }

    const userRef = doc(db, 'users', userId);
    setDoc(userRef, { id: userId }, { merge: true });

    const unsubUser = onSnapshot(userRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        let updates = {};
        if (!data.connectionCode) updates.connectionCode = 'VIBE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!data.loverKey) updates.loverKey = 'LOVE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const pendingMode = localStorage.getItem('pendingAccountMode');
        if (pendingMode) {
          updates.mode = pendingMode;
          localStorage.removeItem('pendingAccountMode');
        }
        
        if (!data.friends) updates.friends = [];
        if (!data.pendingRequests) updates.pendingRequests = [];
        if (data.bio === undefined) updates.bio = '';

        if (Object.keys(updates).length > 0) {
          await updateDoc(userRef, updates);
          Object.assign(data, updates);
        }

        setUserData(data);
        if (!tempName) setTempName(data.name || '');
        if (!tempBio) setTempBio(data.bio || '');
      }
      setLoadingUser(false);
    });

    return () => unsubUser();
  }, [userId, navigate]);

  // Load Partner Data
  useEffect(() => {
    if (userData?.partnerId) {
      const partnerRef = doc(db, 'users', userData.partnerId);
      const unsubPartner = onSnapshot(partnerRef, (docSnap) => {
        if (docSnap.exists()) setPartnerData(docSnap.data());
        else setPartnerData(null);
      });
      return () => unsubPartner();
    } else {
      setPartnerData(null);
    }
  }, [userData?.partnerId]);

  // Load Friends Data
  useEffect(() => {
    if (userData?.friends && userData.friends.length > 0) {
      const q = query(collection(db, 'users'), where('id', 'in', userData.friends.slice(0, 30)));
      const unsub = onSnapshot(q, (snapshot) => {
        let fData = [];
        snapshot.forEach(docSnap => fData.push(docSnap.data()));
        setFriendsData(fData);
      });
      return () => unsub();
    } else {
      setFriendsData([]);
    }
  }, [userData?.friends]);

  // Load Feed Messages
  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, 'feed'),
      where('visibleTo', 'array-contains', userId)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      let msgsArray = [];
      snapshot.docs.forEach(docSnap => {
        const msg = { id: docSnap.id, ...docSnap.data() };
        msgsArray.push(msg);
        
        // Auto mark as read if not read by me and I am not sender
        if (msg.senderId !== userId) {
          const readBy = msg.readBy || [];
          const hasRead = readBy.find(r => r.id === userId);
          if (!hasRead && msg.createdAt) {
             updateDoc(doc(db, 'feed', msg.id), {
               readBy: arrayUnion({ id: userId, avatar: userData?.avatar || null, name: userData?.name || 'Bạn' })
             });
          }
        }
      });

      // Sort client-side
      msgsArray.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });

      setMessages(msgsArray.slice(0, 30));
      setLoadingChat(false);
    }, (err) => {
      console.error(err);
      setLoadingChat(false);
    });
    return () => unsub();
  }, [userId, userData?.avatar, userData?.name]);

  const processConnectionCode = async (result) => {
    if (!result.startsWith('VIBE-') && !result.startsWith('LOVE-')) {
      alert('Mã này không hợp lệ. Phải bắt đầu bằng VIBE- hoặc LOVE-');
      return;
    }
    if (result === userData?.connectionCode || result === userData?.loverKey) {
      alert('Đây là mã của chính bạn!');
      return;
    }
    
    // Check which code it is
    const isLover = result.startsWith('LOVE-');
    const fieldToCheck = isLover ? 'loverKey' : 'connectionCode';

    const q = query(collection(db, 'users'), where(fieldToCheck, '==', result));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
       alert('Mã không tồn tại hoặc đã hết hạn!');
       return;
    }
    
    const partnerDoc = querySnapshot.docs[0];
    const partnerId = partnerDoc.id;

    if (userData?.friends?.includes(partnerId) || userData?.partnerId === partnerId) {
       alert('Hai bạn đã kết nối rồi!');
       return;
    }

    // Send Request
    try {
      await updateDoc(doc(db, 'users', partnerId), { 
         pendingRequests: arrayUnion({
            fromId: userId,
            fromName: userData?.name || 'Ẩn danh',
            fromAvatar: userData?.avatar || null,
            fromBio: userData?.bio || '',
            type: isLover ? 'lover' : 'friend',
            timestamp: Date.now()
         })
      });
      alert('Đã gửi lời mời thành công! Đang chờ đối phương xác nhận.');
    } catch (e) {
      alert('Lỗi khi gửi lời mời.');
    }
  };

  const handleScanPartner = async (e) => {
    const file = e.target.files[0];
    e.target.value = null;
    if (!file) return;
    try {
      const result = await scanQRCodeFromFile(file);
      if (result) {
        await processConnectionCode(result.trim().toUpperCase());
      } else {
        alert('Không tìm thấy Mã QR trong ảnh!');
      }
    } catch (err) {
      alert('Lỗi khi đọc ảnh.');
    }
  };
  
  const handleConnectByCode = async (code) => {
    await processConnectionCode(code.trim().toUpperCase());
  };

  const handleAcceptRequest = async (request) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        pendingRequests: arrayRemove(request)
      });
      
      if (request.type === 'lover') {
        await updateDoc(doc(db, 'users', userId), { partnerId: request.fromId });
        await updateDoc(doc(db, 'users', request.fromId), { partnerId: userId });
        alert('Đã chấp nhận Chìa Khóa Tình Yêu! Chế độ Couple đã mở khóa.');
      } else {
        await updateDoc(doc(db, 'users', userId), { friends: arrayUnion(request.fromId) });
        await updateDoc(doc(db, 'users', request.fromId), { friends: arrayUnion(userId) });
        alert('Đã trở thành bạn bè!');
      }
    } catch (error) {
      console.error(error);
      alert('Lỗi khi chấp nhận lời mời.');
    }
  };

  const handleRejectRequest = async (request) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        pendingRequests: arrayRemove(request)
      });
    } catch (error) {
      alert('Lỗi khi từ chối lời mời.');
    }
  };

  const handlePromoteToLover = async (friendId) => {
    if (userData?.partnerId) {
      alert("Bạn đã có người yêu rồi!");
      return;
    }
    
    try {
      await updateDoc(doc(db, 'users', userId), { 
         partnerId: friendId,
         friends: arrayRemove(friendId)
      });
      await updateDoc(doc(db, 'users', friendId), { 
         partnerId: userId,
         friends: arrayRemove(userId)
      });
      alert("Đã vào chế độ Mập Mờ! (Và tự động thành Người Yêu để test)");
    } catch (err) {
      console.error(err);
      alert('Lỗi khi nâng cấp.');
    }
  };

  const handleDemoteLover = async (partnerId) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
         partnerId: null,
         friends: arrayUnion(partnerId)
      });
      await updateDoc(doc(db, 'users', partnerId), { 
         partnerId: null,
         friends: arrayUnion(userId)
      });
      alert("Đã chuyển Người Yêu thành Lốp dự phòng (Bạn bè bình thường)!");
      setOpenLoverMenu(false);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi giáng cấp.");
    }
  };

  const handleSendMessage = async (e, imageBase64 = null) => {
    if (e) e.preventDefault();
    if (!message.trim() && !imageBase64) return;

    let audience = [userId];
    if (userData?.partnerId) audience.push(userData.partnerId);
    if (userData?.friends) audience.push(...userData.friends);
    audience = [...new Set(audience)];

    try {
      await addDoc(collection(db, 'feed'), {
        text: message.trim(),
        imageUrl: imageBase64,
        createdAt: serverTimestamp(),
        senderId: userId,
        senderName: userData?.name || 'Vô danh',
        senderAvatar: userData?.avatar || null,
        visibleTo: audience,
        readBy: [{ id: userId, avatar: userData?.avatar || null }]
      });
      setMessage('');
    } catch (err) {
      console.error(err);
      alert('Không thể đăng bài. Lỗi chi tiết: ' + err.message);
    }
  };
  
  const handleUploadImageForFeed = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        handleSendMessage(null, compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    await updateDoc(doc(db, 'users', userId), { name: tempName, bio: tempBio, mode: tempMode });
    setSettingsView('main');
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    navigate('/');
  };

  const handleRemoveFriend = async (friendId, isLover = false) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa người này?')) {
      try {
        if (isLover) {
          await updateDoc(doc(db, 'users', userId), { partnerId: null });
        } else {
          await updateDoc(doc(db, 'users', userId), { friends: arrayRemove(friendId) });
        }
      } catch (err) {
        alert('Lỗi khi xóa kết nối.');
      }
    }
  };

  const handleDownloadQr = async (ref, filename) => {
    if (!ref.current) return;
    setSavingQr(true);
    try {
      const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: null, useCORS: true });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = filename;
      link.click();
    } catch (err) {
      alert('Lỗi khi lưu ảnh!');
    }
    setSavingQr(false);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 150;
        const size = Math.min(img.width, img.height);
        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        updateDoc(doc(db, 'users', userId), { avatar: compressedBase64 });
        setUserData(prev => ({...prev, avatar: compressedBase64}));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + 
           date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  if (loadingUser) return <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center' }}>Đang tải...</div>;

  return (
    <div className="page-container" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', zIndex: 50, position: 'relative' }}>
        <button 
          onClick={() => {
            setShowSettings(true);
            setSettingsView('main');
            setTempName(userData?.name || '');
            setTempBio(userData?.bio || '');
            setTempMode(userData?.mode || 'couple');
          }}
          style={{ position: 'relative', zIndex: 50, background: 'white', border: 'none', padding: '12px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
          <Settings size={24} color="var(--primary-color)" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <h2 className="brand-text" style={{ fontSize: '28px' }}><span className="highlight-v">V</span>ibely</h2>
        </div>
        <div style={{ width: '48px' }}></div>
      </div>
      
      <div style={{ textAlign: 'center', marginBottom: '16px', zIndex: 10 }}>
        {isConnected ? (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
             {userData?.partnerId && (
               <span style={{ background: '#ff4b82', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                 <Heart size={12} fill="white" /> {partnerData?.name || 'Người Yêu'}
               </span>
             )}
             {userData?.friends?.length > 0 && (
               <span style={{ background: '#4bb2ff', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                 <Users size={12} /> {userData.friends.length} Bạn bè
               </span>
             )}
          </div>
        ) : (
          <span style={{ background: '#ff9500', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            Chưa kết nối
          </span>
        )}
      </div>

      {/* Main Area: News Feed */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', overflowY: 'auto', gap: '24px', paddingBottom: '32px' }}>
        
        {!isConnected && messages.length === 0 ? (
          <div className="animate-fade-in glass-panel" style={{ width: '100%', padding: '32px 24px', textAlign: 'center', borderRadius: '32px' }}>
            <Heart size={48} color="var(--primary-color)" fill="var(--primary-color)" style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>Bạn chưa kết nối ai!</h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>Vào phần <b>Cài đặt (Góc trái)</b> để kết bạn và gửi lời mời Người yêu nhé.</p>
          </div>
        ) : loadingChat ? (
          <div style={{ color: '#888', margin: 'auto' }}>Đang tải bảng tin...</div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            
            {/* 1. STATE TRỐNG HOẶC TIN NHẮN MỚI NHẤT */}
            {messages.length === 0 ? (
              <div className="glass-panel" style={{ width: '100%', aspectRatio: '1/1', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px', textAlign: 'center', borderRadius: '36px', boxShadow: '0 24px 48px rgba(0,0,0,0.1)' }}>
                <Heart size={48} color="var(--primary-color)" fill="var(--primary-color)" style={{ opacity: 0.2, position: 'absolute', top: '32px', right: '32px' }} />
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#999', lineHeight: '1.4' }}>
                  Bảng tin trống! Đăng bức ảnh đầu tiên đi!
                </h1>
              </div>
            ) : (
              (() => {
                const latestMsg = messages[0];
                const readers = (latestMsg.readBy || []).filter(r => r.id !== latestMsg.senderId);
                return (
                  <div key={latestMsg.id} className="msg-card animate-fade-in" style={{
                    width: '100%',
                    maxWidth: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'white',
                    borderRadius: '36px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
                    border: latestMsg.senderId === userData?.partnerId ? '2px solid rgba(255, 75, 130, 0.4)' : '1px solid #eee',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Header info floating or top */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', background: 'rgba(255,255,255,0.9)', zIndex: 2 }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden' }}>
                         <img src={latestMsg.senderAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + latestMsg.senderId} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {latestMsg.senderName || 'Ẩn danh'}
                          {latestMsg.senderId === userData?.partnerId && <Heart size={16} color="#ff4b82" fill="#ff4b82" />}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{formatTime(latestMsg.createdAt)}</div>
                      </div>
                    </div>

                    {/* Image Area */}
                    {latestMsg.imageUrl && (
                      <div style={{ width: '100%', maxHeight: '65vh', minHeight: '300px', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <img src={latestMsg.imageUrl} alt="post" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    )}
                    
                    {/* Text Area */}
                    {latestMsg.text && (
                      <div style={{ padding: '20px', fontSize: '18px', fontWeight: '500', lineHeight: '1.4', color: '#333' }}>
                        {latestMsg.text}
                      </div>
                    )}

                    {/* Footer: Read Receipts Bubbles */}
                    {readers.length > 0 && (
                      <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#888', marginRight: '4px' }}>Đã xem:</span>
                        {readers.map(reader => (
                          <img 
                            key={reader.id} 
                            src={reader.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + reader.id} 
                            alt={reader.name}
                            title={reader.name}
                            style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            {/* 2. INPUT AREA (Luôn hiện nếu đã kết nối, bất kể có tin nhắn hay chưa) */}
            <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '500px', margin: '0 auto', zIndex: 10 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <input type="file" accept="image/*" onChange={handleUploadImageForFeed} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                <button style={{ width: '54px', height: '54px', borderRadius: '24px', border: 'none', background: '#f0f0f0', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <ImageIcon size={24} />
                </button>
              </div>
              <form onSubmit={handleSendMessage} style={{ flex: 1, display: 'flex', gap: '12px', minWidth: 0 }}>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Viết phản hồi nhanh..."
                  style={{ flex: 1, minWidth: 0, padding: '16px 20px', borderRadius: '24px', border: 'none', background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: '15px', outline: 'none' }}
                />
                <button 
                  type="submit" 
                  disabled={!message.trim()}
                  style={{ width: '54px', height: '54px', flexShrink: 0, borderRadius: '24px', border: 'none', background: message.trim() ? 'var(--primary-color)' : '#ccc', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: message.trim() ? 'pointer' : 'default', boxShadow: message.trim() ? '0 8px 24px rgba(255,75,130,0.3)' : 'none', transition: 'all 0.3s' }}>
                  <Send size={20} style={{ marginLeft: '4px' }} />
                </button>
              </form>
            </div>
            
            {/* 2.5 NÚT LỊCH SỬ (Dời lên sát Input Area) */}
            {isConnected && messages.length > 0 && (
              <div style={{ width: '100%', maxWidth: '500px', margin: '8px auto 0', zIndex: 10 }}>
                <button 
                  onClick={() => {
                    if (messages.length > 1) setShowHistory(!showHistory);
                  }}
                  disabled={messages.length <= 1}
                  style={{ width: '100%', background: 'white', border: '1px solid #ddd', padding: '12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', color: messages.length > 1 ? '#666' : '#ccc', cursor: messages.length > 1 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                >
                  {messages.length <= 1 ? 'Chưa có lịch sử cũ' : showHistory ? 'Ẩn bớt lịch sử' : `Xem lịch sử (${messages.length - 1}) ⬇️`}
                </button>
              </div>
            )}
            
            {/* 3. HISTORY MESSAGES */}
            {showHistory && messages.slice(1).map((msgObj) => {
              const readers = (msgObj.readBy || []).filter(r => r.id !== msgObj.senderId);
              return (
                  <div key={msgObj.id} className="msg-card animate-fade-in" style={{
                    width: '100%',
                    maxWidth: '450px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    background: 'white',
                    borderRadius: '24px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                    border: '1px solid #eee',
                    position: 'relative',
                    opacity: 0.9
                  }}>
                    {/* Header: Author */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f0f0f0', overflow: 'hidden' }}>
                         <img src={msgObj.senderAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + msgObj.senderId} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {msgObj.senderName || 'Ẩn danh'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{formatTime(msgObj.createdAt)}</div>
                      </div>
                    </div>
                    {msgObj.imageUrl && (
                      <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
                        <img src={msgObj.imageUrl} alt="post" style={{ width: '100%', maxHeight: '250px', objectFit: 'cover', display: 'block' }} />
                      </div>
                    )}
                    {msgObj.text && (
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4', color: '#444', padding: msgObj.imageUrl ? '0' : '4px 0' }}>{msgObj.text}</p>
                    )}
                    
                    {readers.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '8px', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#888', marginRight: '4px' }}>Đã xem:</span>
                        {readers.map(reader => (
                          <img 
                            key={reader.id} 
                            src={reader.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + reader.id} 
                            alt={reader.name}
                            title={reader.name}
                            style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', border: '1px solid white' }} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '32px', padding: '32px', position: 'relative', scrollbarWidth: 'none' }}>
            <button 
              onClick={() => {
                if (settingsView === 'profile') setSettingsView('main');
                else setShowSettings(false);
              }} 
              style={{ position: 'absolute', top: '24px', left: settingsView === 'profile' ? '24px' : 'auto', right: settingsView === 'main' ? '24px' : 'auto', background: '#f5f5f5', border: 'none', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
              {settingsView === 'profile' ? <ArrowLeft size={20} color="#666" /> : <X size={20} color="#666" />}
            </button>
            
            <h3 style={{ fontSize: '20px', marginBottom: '24px', textAlign: 'center' }}>
              {settingsView === 'main' ? 'Cài Đặt' : 'Trang Cá Nhân'}
            </h3>
            
            {settingsView === 'main' ? (
              <div className="animate-fade-in">
                {/* Profile Button */}
                <button 
                  onClick={() => setSettingsView('profile')}
                  style={{ width: '100%', background: 'white', padding: '16px', borderRadius: '24px', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', marginBottom: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <img src={userData?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userId} alt="Avatar" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} />
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#333' }}>{userData?.name || 'Chưa thiết lập tên'}</div>
                    <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Xem trang cá nhân & Mã QR</div>
                  </div>
                </button>

                {/* KHU VỰC LỜI MỜI KẾT BẠN */}
                {userData?.pendingRequests?.length > 0 && (
                  <div style={{ marginBottom: '24px', background: '#fff9fa', padding: '16px', borderRadius: '20px', border: '1px solid #ffe5eb' }}>
                    <h4 style={{ fontSize: '15px', color: 'var(--primary-color)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Heart size={18} /> Lời Mời Kết Bạn ({userData.pendingRequests.length})
                    </h4>
                    {userData.pendingRequests.map((req, idx) => (
                      <div key={idx} style={{ background: 'white', padding: '12px', borderRadius: '16px', marginBottom: '12px', boxShadow: '0 4px 12px rgba(255,75,130,0.1)' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <img src={req.fromAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + req.fromId} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                              {req.fromName} 
                              {req.type === 'lover' && <span style={{ color: '#ff4b82', marginLeft: '4px', fontSize: '12px' }}>(Gửi Chìa Khóa 💖)</span>}
                            </div>
                            {req.fromBio && <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>"{req.fromBio}"</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button onClick={() => handleAcceptRequest(req)} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'var(--primary-color)', color: 'white', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}>
                            <Check size={16} /> Chấp nhận
                          </button>
                          <button onClick={() => handleRejectRequest(req)} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#f5f5f5', color: '#666', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}>
                            <X size={16} /> Bỏ qua
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* DANH SÁCH KẾT NỐI */}
                <div style={{ marginBottom: '24px' }}>
                   <h4 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Users size={20} color="var(--primary-color)" /> Danh Sách Kết Nối
                   </h4>
                   
                   <div style={{ marginBottom: '16px', position: 'relative' }}>
                     <input 
                       type="text" 
                       placeholder="Nhập VIBE-... hoặc LOVE-... rồi Enter" 
                       onKeyDown={(e) => { if (e.key === 'Enter') handleConnectByCode(e.target.value); }}
                       style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                     />
                     <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <input type="file" accept="image/*" onChange={handleScanPartner} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                       <ImageIcon size={18} color="#888" />
                     </div>
                   </div>

                   {/* LOVER CARD */}
                   {userData?.partnerId && (
                     <div style={{ background: '#fff0f5', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', marginBottom: '8px', border: '1px solid #ffb3c6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div 
                            onClick={() => setOpenLoverMenu(!openLoverMenu)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                            title="Bấm vào để xem tùy chọn"
                          >
                            <Heart size={24} color="#ff4b82" fill="#ff4b82" />
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>{partnerData?.name || 'Người Yêu'}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>ID: {userData.partnerId}</div>
                            </div>
                          </div>
                          <button onClick={() => handleRemoveFriend(userData.partnerId, true)} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', padding: '4px' }}><UserMinus size={18} /></button>
                        </div>
                        
                        {/* Lốp dự phòng menu */}
                        {openLoverMenu && (
                          <div className="animate-fade-in" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,75,130,0.2)', display: 'flex', justifyContent: 'flex-start' }}>
                            <button 
                              onClick={() => handleDemoteLover(userData.partnerId)} 
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8f9fa', color: '#555', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                            >
                              Chỉ là lốp dự phòng thôi!
                            </button>
                          </div>
                        )}
                     </div>
                   )}

                   {/* FRIENDS CARDS */}
                   {friendsData.map(friend => (
                     <div key={friend.id} style={{ background: '#f8f9fa', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', marginBottom: '8px', border: '1px solid #eee' }}>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div 
                            onClick={() => setOpenFriendMenu(openFriendMenu === friend.id ? null : friend.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                            title="Bấm vào để xem tùy chọn"
                          >
                            <img src={friend.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + friend.id} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} alt="avatar" />
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>{friend.name || 'Bạn Bè'}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>ID: {friend.id}</div>
                            </div>
                          </div>
                          <button onClick={() => handleRemoveFriend(friend.id, false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
                        </div>
                        
                        {/* Mập mờ menu */}
                        {openFriendMenu === friend.id && (
                          <div className="animate-fade-in" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'flex-start' }}>
                            <button 
                              onClick={() => {
                                setOpenFriendMenu(null);
                                handlePromoteToLover(friend.id);
                              }} 
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, rgba(255, 75, 130, 0.9) 0%, rgba(255, 143, 163, 0.9) 100%)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,75,130,0.2)' }}
                            >
                              <Heart size={14} fill="white" /> Mập mờ (Test: Nâng cấp ngay)
                            </button>
                          </div>
                        )}
                     </div>
                   ))}
                   
                   {!userData?.partnerId && (!userData?.friends || userData.friends.length === 0) && (
                     <div style={{ textAlign: 'center', fontSize: '13px', color: '#888', padding: '12px' }}>Chưa có ai trong danh sách.</div>
                   )}
                </div>

                <button onClick={handleLogout} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#fff0f0', color: '#ff3b30', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                  <LogOut size={20} /> Đăng Xuất
                </button>
              </div>
            ) : (
              // PROFILE VIEW
              <div className="animate-fade-in">
                <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                  <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto', marginBottom: '16px' }}>
                    <img src={userData?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userId} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 }} />
                    <div style={{ position: 'absolute', bottom: 0, right: '-5px', background: 'var(--primary-color)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', zIndex: 1 }}>📷</div>
                  </div>
                  
                  <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>TÊN HIỂN THỊ CỦA BẠN</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="VD: Hieu, Vy..."
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box' }}
                  />

                  <label style={{ display: 'block', fontSize: '13px', color: '#888', marginTop: '16px', marginBottom: '8px', fontWeight: 'bold' }}>TIỂU SỬ</label>
                  <input 
                    type="text" 
                    value={tempBio}
                    onChange={(e) => setTempBio(e.target.value)}
                    placeholder="Viết một câu giới thiệu ngắn..."
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  
                  <label style={{ display: 'block', fontSize: '13px', color: '#888', marginTop: '20px', marginBottom: '8px', fontWeight: 'bold' }}>MỤC ĐÍCH SỬ DỤNG APP</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setTempMode('couple')} style={{ flex: 1, padding: '10px', borderRadius: '12px', border: tempMode === 'couple' ? '2px solid var(--primary-color)' : '1px solid #ddd', background: tempMode === 'couple' ? '#fff0f5' : '#fff', color: tempMode === 'couple' ? 'var(--primary-color)' : '#666', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Couple</button>
                    <button onClick={() => setTempMode('friends')} style={{ flex: 1, padding: '10px', borderRadius: '12px', border: tempMode === 'friends' ? '2px solid var(--primary-color)' : '1px solid #ddd', background: tempMode === 'friends' ? '#fff0f5' : '#fff', color: tempMode === 'friends' ? 'var(--primary-color)' : '#666', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Friends</button>
                    <button onClick={() => setTempMode('both')} style={{ flex: 1, padding: '10px', borderRadius: '12px', border: tempMode === 'both' ? '2px solid var(--primary-color)' : '1px solid #ddd', background: tempMode === 'both' ? '#fff0f5' : '#fff', color: tempMode === 'both' ? 'var(--primary-color)' : '#666', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Both</button>
                  </div>
                </div>
                
                {/* Connection Codes Area */}
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', snapType: 'x mandatory' }}>
                  
                  {/* Friend Code */}
                  <div style={{ flex: '0 0 100%', scrollSnapAlign: 'start' }}>
                    <div 
                      ref={qrRefFriend}
                      style={{
                        background: 'linear-gradient(135deg, #4bb2ff 0%, #1ea0ff 100%)',
                        padding: '24px',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        color: 'white'
                      }}
                    >
                      <h4 className="brand-text" style={{ marginBottom: '8px', fontSize: '20px', zIndex: 1 }}><span className="highlight-v" style={{color:'white'}}>V</span>ibely</h4>
                      <p style={{ opacity: 0.9, fontSize: '13px', marginBottom: '20px', fontWeight: 'bold', textTransform: 'uppercase', zIndex: 1, letterSpacing: '0.5px' }}>Mã Kết Bạn</p>
                      
                      <div style={{ background: 'white', padding: '12px', borderRadius: '12px', zIndex: 1 }}>
                        <QRCodeCanvas value={userData?.connectionCode || 'loading'} size={120} level="H" fgColor="#333333" includeMargin={true} />
                      </div>
                      
                      <p style={{ marginTop: '16px', fontWeight: 'bold', letterSpacing: '2px', zIndex: 1, fontSize: '18px' }}>{userData?.connectionCode}</p>
                    </div>
                    <button onClick={() => handleDownloadQr(qrRefFriend, 'vibely-friend-code.png')} disabled={savingQr} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #4bb2ff', background: 'transparent', color: '#4bb2ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '12px', cursor: 'pointer' }}>
                      Lưu Mã Kết Bạn
                    </button>
                  </div>

                  {/* Lover Key */}
                  <div style={{ flex: '0 0 100%', scrollSnapAlign: 'start' }}>
                    <div 
                      ref={qrRefLover}
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 75, 130, 0.95) 0%, rgba(255, 143, 163, 0.95) 100%)',
                        padding: '24px',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        color: 'white'
                      }}
                    >
                      <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Lock size={12} /> Đang bật để Test
                      </div>
                      <h4 className="brand-text" style={{ marginBottom: '8px', fontSize: '20px', zIndex: 1 }}><span className="highlight-v">V</span>ibely</h4>
                      <p style={{ opacity: 0.9, fontSize: '13px', marginBottom: '20px', fontWeight: 'bold', textTransform: 'uppercase', zIndex: 1, letterSpacing: '0.5px' }}>Chìa Khóa Tình Yêu</p>
                      
                      <div style={{ background: 'white', padding: '12px', borderRadius: '12px', zIndex: 1 }}>
                        <QRCodeCanvas value={userData?.loverKey || 'loading'} size={120} level="H" fgColor="#333333" includeMargin={true} />
                      </div>
                      
                      <p style={{ marginTop: '16px', fontWeight: 'bold', letterSpacing: '2px', zIndex: 1, fontSize: '18px' }}>{userData?.loverKey}</p>
                    </div>
                    <p style={{ fontSize: '11px', color: '#888', textAlign: 'center', marginTop: '8px' }}>
                      * Chìa khóa này thường sẽ mở sau 7 ngày kết bạn, hiện đang mở khóa để thử nghiệm. Chỉ đưa cho người yêu của bạn!
                    </p>
                    <button onClick={() => handleDownloadQr(qrRefLover, 'vibely-lover-key.png')} disabled={savingQr} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid var(--primary-color)', background: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '12px', cursor: 'pointer' }}>
                      Lưu Chìa Khóa
                    </button>
                  </div>
                  
                </div>
                
                {/* Swipe Indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4bb2ff' }}></div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff4b82' }}></div>
                </div>
                
                <button className="btn-primary" onClick={handleSaveSettings} style={{ width: '100%', padding: '16px', borderRadius: '16px' }}>
                  Lưu & Quay lại
                </button>
              </div>
            )}
            
          </div>
        </div>
      )}
    </div>
  );
}
