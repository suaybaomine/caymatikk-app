import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp
} from 'firebase/firestore';
import { Coffee, LogIn, User, Plus } from 'lucide-react';

// --- Firebase Kurulumu ---
const firebaseConfig = {
  apiKey: "AIzaSyDAPEaOSV-VfGe17I0vwn5X8_VR_g9YZQk",
  authDomain: "caymatik-c8c9a.firebaseapp.com",
  projectId: "caymatik-c8c9a",
  storageBucket: "caymatik-c8c9a.firebasestorage.app",
  messagingSenderId: "271035945226",
  appId: "1:271035945226:web:4a86ec4b2a02d9e7216af3"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


export default function Caymatik() {
  const [user, setUser] = useState(null);
  const [currentName, setCurrentName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [loginInput, setLoginInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Stok ekleme için input state'i
  const [addStockAmount, setAddStockAmount] = useState('');

  // 1. Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth hatası:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    
    const savedName = localStorage.getItem('caymatik_username');
    if (savedName) {
      setCurrentName(savedName);
      setIsLoggedIn(true);
    }

    return () => unsubscribe();
  }, []);

  // 2. Verileri Dinleme
  useEffect(() => {
    if (!user) return;

    const usersCollectionRef = collection(db, 'caymatik_users');

    const unsubscribe = onSnapshot(usersCollectionRef, (snapshot) => {
      const fetchedUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Eski verilerde totalPurchased olmayabilir, varsa onu kullan, yoksa count pozitifse onu varsay
        totalPurchasedDisplay: doc.data().totalPurchased || (doc.data().count > 0 ? doc.data().count : 0)
      }));
      
      // Sıralama: En çok çay alan (totalPurchasedDisplay) en üstte
      fetchedUsers.sort((a, b) => b.totalPurchasedDisplay - a.totalPurchasedDisplay);
      
      setUsersList(fetchedUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Giriş Yapma
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginInput.trim() || !user) return;
    
    setProcessing(true);
    const nameToUse = loginInput.trim();

    const existingUser = usersList.find(u => u.name.toLowerCase() === nameToUse.toLowerCase());

    if (!existingUser) {
      try {
        await addDoc(collection(db, 'caymatik_users'), {
          name: nameToUse,
          count: 0, // Anlık Bakiye
          totalPurchased: 0, // Toplam Alınan
          createdAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Kullanıcı oluşturma hatası:", error);
      }
    }

    localStorage.setItem('caymatik_username', nameToUse);
    setCurrentName(nameToUse);
    setIsLoggedIn(true);
    setProcessing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('caymatik_username');
    setIsLoggedIn(false);
    setCurrentName('');
    setLoginInput('');
  };

  // 4. Çay İÇME İşlemi (-1 Bakiye Düşer)
  const handleDrinkTea = async () => {
    if (!user || !currentName) return;
    
    const currentUserData = usersList.find(u => u.name.toLowerCase() === currentName.toLowerCase());
    
    if (currentUserData) {
      try {
        const userDocRef = doc(db, 'caymatik_users', currentUserData.id);
        await updateDoc(userDocRef, {
          count: (currentUserData.count || 0) - 1
        });
      } catch (error) {
        console.error("İçme işlemi hatası:", error);
      }
    }
  };

  // 5. Çay ALMA İşlemi (+X Bakiye Artar, +X Toplam Alınan Artar)
  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!user || !currentName || !addStockAmount) return;
    
    const amount = parseInt(addStockAmount);
    if (isNaN(amount) || amount <= 0) return;

    const currentUserData = usersList.find(u => u.name.toLowerCase() === currentName.toLowerCase());
    
    if (currentUserData) {
      try {
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'caymatik_users', currentUserData.id);
        
        // Hem bakiyeyi hem de toplam satın alma istatistiğini güncelle
        await updateDoc(userDocRef, {
          count: (currentUserData.count || 0) + amount,
          totalPurchased: (currentUserData.totalPurchased || 0) + amount
        });
        setAddStockAmount('');
      } catch (error) {
        console.error("Stok ekleme hatası:", error);
      }
    }
  };

  // Toplam Ofis Stoğu (Kalan Çay)
  // GÜNCELLEME: Artık toplam satın alınan değil, anlık bakiyelerin toplamı.
  // Biri çay içtiğinde bu sayı azalır.
  const totalTeaGlobal = usersList.reduce((acc, curr) => acc + (curr.count || 0), 0);

  if (loading && !usersList.length && !user) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  // --- EKRAN 1: GİRİŞ ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-8 border-orange-600">
          <div className="flex justify-center mb-6">
            <div className="bg-orange-100 p-4 rounded-full">
              <Coffee size={48} className="text-orange-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Çaymatik Giriş</h1>
          <p className="text-center text-gray-500 mb-8">İsminle giriş yap, bakiyeni yönet.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adın Soyadın</label>
              <div className="relative">
                <User size={20} className="absolute left-3 top-3.5 text-gray-400" />
                <input 
                  type="text" 
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="Örn: Ahmet Yılmaz"
                  required
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={processing}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {processing ? 'Giriş yapılıyor...' : <><LogIn size={20} /> Giriş Yap</>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- EKRAN 2: PANEL ---
  return (
    <div className="min-h-screen bg-stone-50 font-sans text-gray-800 pb-20 relative">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coffee className="text-orange-600" size={24} />
            <span className="font-bold text-xl text-gray-800">Çaymatik</span>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500 underline decoration-dotted">
            Çıkış ({currentName})
          </button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 pt-6">
        
        {/* ORTAK TOPLAM KART */}
        <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-6 shadow-lg text-white text-center mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-white/5 pointer-events-none"></div>
          
          <h2 className="text-white/90 text-lg mb-1">Ofis Toplamı (Stok)</h2>
          <p className="text-6xl font-bold mb-2">{totalTeaGlobal}</p>
          <p className="text-white/80 text-sm mb-6">
            Ofiste kalan anlık çay sayısı
          </p>

          {/* İKİ ANA AKSİYON */}
          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={handleDrinkTea}
              className="w-full bg-white text-red-600 font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <Coffee size={24} />
              Çay İçtim (-1)
            </button>

            <div className="bg-black/20 rounded-xl p-1 flex items-center">
                <input 
                  type="number" 
                  placeholder="Adet"
                  value={addStockAmount}
                  onChange={(e) => setAddStockAmount(e.target.value)}
                  className="w-20 bg-white/90 text-gray-800 placeholder-gray-500 font-bold text-center rounded-lg py-3 outline-none focus:bg-white ml-1"
                />
                <button 
                  onClick={handleAddStock}
                  disabled={!addStockAmount}
                  className="flex-1 text-white font-semibold py-3 px-4 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus size={20} />
                  Çay Aldım
                </button>
            </div>
          </div>
        </div>

        {/* LİDERLİK TABLOSU (Alınan Çaylar) */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              {/* Kupa ikonu kaldırıldı */}
              <h3 className="font-bold text-gray-700">Alınan Çaylar</h3>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>İsim</span>
              <span>Toplam Alım</span>
            </div>
            {usersList.map((u, index) => (
              <div 
                key={u.id}
                className={`flex items-center justify-between p-4 border-b last:border-0 ${u.name === currentName ? 'bg-orange-50/50' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`
                    w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                    ${index === 0 && u.totalPurchasedDisplay > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}
                  `}>
                    {index + 1}
                  </div>
                  <div>
                    <p className={`font-medium ${u.name === currentName ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                      {u.name} {u.name === currentName && '(Sen)'}
                    </p>
                  </div>
                </div>
                
                <div className="font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg w-16 text-center">
                  {u.totalPurchasedDisplay}
                </div>
              </div>
            ))}

            {usersList.length === 0 && (
              <div className="p-6 text-center text-gray-400">
                Henüz kimse kayıtlı değil.
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}