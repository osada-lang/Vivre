// Firebase Config
console.log("Initializing Firebase with config...");
const firebaseConfig = {
    apiKey: "AIzaSyAkwCy3gdAl3Dtjw-7Vciyht1MWURO8iLI",
    authDomain: "vivre-app-192aa.firebaseapp.com",
    databaseURL: "https://vivre-app-192aa-default-rtdb.firebaseio.com",
    projectId: "vivre-app-192aa",
    storageBucket: "vivre-app-192aa.firebasestorage.app",
    messagingSenderId: "533143947175",
    appId: "1:533143947175:web:2283b997ea3d91e53f1882",
    measurementId: "G-B5HGZKYMW7"
};
console.log("Database URL:", firebaseConfig.databaseURL);

// Initialize
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// State
let myMode = null; // 'master' or 'follower'
let currentRoomId = null;
let myUserId = Math.random().toString(36).substring(7);
let masterLocation = null;
let myLocation = { lat: null, lng: null };
let myHeading = 0;
let watchId = null;

// --- Version Management ---
const APP_VERSION = '1.0.1'; // 現在のアプリバージョン
let latestVersion = '1.0.1';

// --- Wait Utility ---
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Brand Splash Logic ---
async function showBrandSplash() {
    const splash = document.getElementById('brand-splash');
    const logo = document.getElementById('brand-logo');
    if (!splash || !logo) return;

    // ロゴのフェードイン (1.0s)
    await wait(100);
    logo.classList.add('fade-in');
    await wait(1500); // 1.0s fade-in + 0.5s static

    // フェードアウト (1.0s)
    logo.classList.remove('fade-in');
    await wait(1000); // 1.0s fade-out

    // 「タップしてスタート」テキストを表示
    const tapText = document.createElement('p');
    tapText.textContent = 'タップしてスタート';
    tapText.style.cssText = 'color:#999;font-size:1rem;position:absolute;bottom:25%;left:50%;transform:translateX(-50%);animation:fadeInTap 1s ease infinite alternate;';
    splash.appendChild(tapText);

    // ユーザーのタップを待ってからホーム画面へ遷移
    await new Promise(resolve => {
        const onTap = (e) => {
            e.preventDefault();
            e.stopPropagation();
            splash.removeEventListener('click', onTap, true);
            splash.removeEventListener('touchend', onTap, true);
            resolve();
        };
        splash.addEventListener('click', onTap, true);
        splash.addEventListener('touchend', onTap, true);
    });

    // スプラッシュ全体をフェードアウトして削除
    splash.classList.add('fade-out');
    await wait(1000);
    splash.remove();
}

// Initialize on Load
window.addEventListener('load', async () => {
    // 背景で Remote Config の取得を開始
    const configPromise = initRemoteConfig();
    
    // スプラッシュ演出（タップ待ち含む）を実行
    await showBrandSplash();
    
    // スプラッシュ終了後にアップデートチェックを実行
    await configPromise; // 取得が終わるまで念のため待機
    checkUpdate();
});

// --- Remote Config ---
async function initRemoteConfig() {
    console.log("Fetching Remote Config...");
    try {
        const remoteConfig = firebase.remoteConfig();
        // ★テスト時はキャッシュ時間を0に設定して即時反映させる
        remoteConfig.settings.minimumFetchIntervalMillis = 0;
        remoteConfig.defaultConfig = { latestVersion: APP_VERSION };

        await remoteConfig.fetchAndActivate();
        latestVersion = remoteConfig.getString('latestVersion');
        console.log('Remote Config: latestVersion (fetched) =', latestVersion);
        console.log('App: APP_VERSION (current) =', APP_VERSION);
    } catch (e) {
        console.warn('Remote Config initialization error:', e);
    }
}

function checkUpdate() {
    // コンマ（,）をドット（.）に置換して正規化（入力ミスの救済）
    const normalizedLatest = latestVersion.replace(/,/g, '.');
    console.log('Checking update: Normalized Latest =', normalizedLatest, 'Current =', APP_VERSION);
    
    if (isNewerVersion(normalizedLatest, APP_VERSION)) {
        console.log("New version detected! Showing overlay...");
        document.getElementById('update-overlay').classList.remove('hidden');
    } else {
        console.log("No update needed.");
    }
}

function isNewerVersion(latest, current) {
    const l = latest.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (l[i] > c[i]) return true;
        if (l[i] < c[i]) return false;
    }
    return false;
}

// UI Elements
const screens = {
    home: document.getElementById('home-screen'),
    join: document.getElementById('join-screen'),
    master: document.getElementById('master-screen'),
    follower: document.getElementById('follower-screen'),
    burn: document.getElementById('burn-overlay'),
    update: document.getElementById('update-overlay')
};

const connectionStatus = document.getElementById('connection-status');
const distanceValueEl = document.getElementById('distance-value');
const distanceUnitEl = document.getElementById('distance-unit');
const vivreCardEl = document.getElementById('vivre-card');
const debugInfoEl = document.getElementById('debug-info');

// Update Buttons
document.getElementById('update-later-btn').addEventListener('click', () => {
    document.getElementById('update-overlay').classList.add('hidden');
});

document.getElementById('update-now-btn').addEventListener('click', () => {
    // ストアのURL（仮）を開く。後で実際のURLに書き換えてください。
    const storeUrl = 'https://play.google.com/store/apps/details?id=com.jirachi.vivre';
    window.open(storeUrl, '_system');
});

// --- Utils ---
function resetStateAndGoHome() {
    // セッション情報のクリア
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).off();
        db.ref(`rooms/${currentRoomId}/followers/${myUserId}`).remove();
    }
    
    // 変数のリセット
    myMode = null;
    currentRoomId = null;
    masterLocation = null;
    myLocation = { lat: null, lng: null };
    
    // UIのリセット
    document.getElementById('vivre-card').classList.remove('burning');
    if (debugInfoEl) debugInfoEl.textContent = '';
    
    // 入力フォームもクリア
    const input = document.getElementById('room-id-input');
    if (input) input.value = '';

    showScreen('home');
}

function showScreen(name) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.toggle('hidden', key !== name);
    });
}

// --- Master Mode ---
const APP_SHARE_URL = 'https://osada-lang.github.io/Vivre/';

// Capacitor Plugins
const { Share } = Capacitor.Plugins;

document.getElementById('mode-master-btn').addEventListener('click', () => {
    myMode = 'master';
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomId = roomId;
    document.getElementById('master-room-id').textContent = roomId;
    
    startMasterSession(roomId);
    showScreen('master');
});

// ビブルカード（合言葉）共有
document.getElementById('share-code-btn').addEventListener('click', async () => {
    if (!currentRoomId) return;
    
    const shareText = `わたしのビブルカード（合言葉）は【${currentRoomId}】です。\nアプリを開いて入力してね！\n\nアプリを持っていない方はこちら：\n${APP_SHARE_URL}`;
    
    try {
        await Share.share({
            title: 'ビブルカード共有',
            text: shareText,
            dialogTitle: 'ビブルカードを仲間に送る'
        });
    } catch (e) {
        console.log('Share failed', e);
        // フォールバック: クリップボードコピー
        try {
            await navigator.clipboard.writeText(shareText);
            alert('ビブルカードをコピーしました。LINE等に貼り付けて送ってください！');
        } catch (err) { alert(shareText); }
    }
});

// アプリ自体の共有 (ホーム画面)
document.getElementById('share-app-btn').addEventListener('click', async () => {
    const shareText = `大切な人へ、方位で導くアプリ「Vivre Card」\nこちらからインストールできます：\n${APP_SHARE_URL}`;
    
    try {
        await Share.share({
            title: 'Vivre Card アプリ共有',
            text: shareText,
            url: APP_SHARE_URL,
            dialogTitle: 'Vivre Card を仲間に教える'
        });
    } catch (e) {
        console.log('Share failed', e);
        try {
            await navigator.clipboard.writeText(shareText);
            alert('アプリ紹介URLをコピーしました。仲間に送ってあげてください！');
        } catch (err) { window.open(APP_SHARE_URL, '_system'); }
    }
});

// 使い方ボタン
document.getElementById('how-to-use-btn').addEventListener('click', () => {
    alert('【使い方】\n1. 集合したい人が「ビブルカードを発行」します。\n2. 発行された6桁のコードを仲間に共有します。\n3. 向かいたい人は「ビブルカードを受け取る」からコードを入力します。\n4. 矢印が指す方向へ進めば、仲間に辿り着けます。');
});

function startMasterSession(roomId) {
    console.log("Starting master session for room:", roomId);
    const roomRef = db.ref(`rooms/${roomId}`);
    const masterPosRef = roomRef.child('master');
    const followersRef = roomRef.child('followers');

    // ★重要: update を使うことで、GPSデータが先に届いても消さないようにする
    roomRef.update({
        createdAt: Date.now(),
        status: 'active'
    }).then(() => {
        console.log("Room initialized/updated in Firebase.");
    }).catch(err => {
        console.error("Firebase update error:", err);
    });

    // 自分の位置情報を定期的に更新
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(pos => {
            const data = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
            masterPosRef.set(data);
        }, err => console.error(err), { enableHighAccuracy: true });
    }

    // フォロワー数の監視
    followersRef.on('value', snapshot => {
        const count = snapshot.numChildren();
        document.getElementById('follower-count').textContent = count;
    });

    // 切断時にルームを削除
    roomRef.onDisconnect().remove();
}

document.getElementById('stop-master-btn').addEventListener('click', () => {
    if (confirm('共有を終了しますか？参加者全員のカードが燃え尽きます。')) {
        db.ref(`rooms/${currentRoomId}`).remove();
        resetStateAndGoHome();
    }
});

// --- Follower Mode ---
document.getElementById('mode-follower-btn').addEventListener('click', () => {
    showScreen('join');
});

document.getElementById('join-back-btn').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('start-follow-btn').addEventListener('click', () => {
    const roomId = document.getElementById('room-id-input').value.trim();
    if (!roomId || roomId.length !== 6) return alert('6桁のビブルカード（合言葉）を入力してください');
    
    myMode = 'follower';
    currentRoomId = roomId;
    document.getElementById('follower-room-id').textContent = roomId;
    
    startFollowerSession(roomId);
});

async function startFollowerSession(roomId) {
    console.log("Starting follower session for room:", roomId);
    const roomRef = db.ref(`rooms/${roomId}`);
    
    // 1. 最初に入力されたルームが存在するか一度だけ確認
    try {
        const initialSnapshot = await roomRef.once('value');
        if (!initialSnapshot.exists()) {
            alert("存在しないビブルカードです。もう一度確認してください。");
            return; // ここで終了し、入力画面に留まる
        }
    } catch (error) {
        console.error("Firebase connection error:", error);
        alert("接続エラーが発生しました。");
        return;
    }

    myMode = 'follower';
    currentRoomId = roomId;
    document.getElementById('follower-room-id').textContent = roomId;

    const myFollowerRef = roomRef.child('followers').child(myUserId);

    // 自分の生存確認用データを登録 (位置は送らない)
    myFollowerRef.set(true);
    myFollowerRef.onDisconnect().remove();

    // 2. ルーム全体をリアルタイム監視して、親の位置とルームの消滅を判定
    roomRef.on('value', snapshot => {
        if (!snapshot.exists()) {
            console.log("Room deleted or doesn't exist.");
            // 一度でもマスターの位置が取れている＝接続が確立していた後の消滅なので燃え尽き
            if (masterLocation) {
                triggerBurnEffect();
            } else {
                // 万が一マスターの位置が取れる前にルームが消えた場合
                alert("ルームが終了しました。");
                resetStateAndGoHome();
            }
            return;
        }

        const roomData = snapshot.val();
        if (roomData.master) {
            console.log("Master location received.");
            masterLocation = roomData.master;
            updateDisplay();
            showScreen('follower');
        } else {
            console.log("Waiting for master location...");
            connectionStatus.textContent = '相手のGPS信号を待っています...';
            showScreen('follower');
        }
    });

    // 自分の位置取得 (計算用のみ。サーバーには送らない)
    // 役割交代時に古い位置情報を引き継がないよう初期化
    myLocation = { lat: null, lng: null };
    if ("geolocation" in navigator) {
        // watchId を保存して、役割交代時にクリアできるようにする
        if (watchId) navigator.geolocation.clearWatch(watchId);
        watchId = navigator.geolocation.watchPosition(pos => {
            myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updateDisplay();
        }, err => {
            console.error("My GPS Error:", err);
            connectionStatus.textContent = '自分のGPS信号を探しています...設定を確認してください';
        }, { enableHighAccuracy: true });
    }

    // コンパス
    startOrientationTracking();
}

function triggerBurnEffect() {
    const card = document.getElementById('vivre-card');
    card.classList.add('burning');
    setTimeout(() => {
        showScreen('burn');
    }, 1500);
}

document.getElementById('burn-retry-btn').addEventListener('click', () => {
    // 状態をリセットして入力画面へ
    masterLocation = null;
    currentRoomId = null;
    document.getElementById('vivre-card').classList.remove('burning');
    showScreen('join');
});

document.getElementById('burn-close-btn').addEventListener('click', () => {
    resetStateAndGoHome();
});

document.getElementById('stop-follow-btn').addEventListener('click', () => {
    resetStateAndGoHome();
});

// --- Logic ---
function startOrientationTracking() {
    // Android (Chrome) 向け: 絶対方位イベントを優先
    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } 
    // iOS 向け: 権限リクエストが必要
    else if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
            if (state === 'granted') window.addEventListener('deviceorientation', handleOrientation, true);
        });
    } 
    // その他
    else {
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

function handleOrientation(event) {
    // webkitCompassHeading (iOS) または alpha (Android) を使用
    // Android の alpha は z軸(垂直)周りの回転で、通常は反時計回りが正
    let heading = 0;
    
    if (event.webkitCompassHeading) {
        // iOS
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        // Android (alpha は北を 0 とする絶対値のはずだが、deviceorientationabsolute を使うのが確実)
        // 多くの Android ブラウザでは alpha は 0-360 の範囲で、北が 0
        heading = 360 - event.alpha;
    }
    
    myHeading = (heading + 360) % 360;
    updateDisplay();
}

function updateDisplay() {
    // 状況を細かくユーザーに伝える
    if (!masterLocation) {
        connectionStatus.textContent = '相手のGPS信号を待っています...';
        return;
    }
    if (!myLocation.lat) {
        connectionStatus.textContent = '自分のGPS信号を探しています...';
        return;
    }

    // 方位の計算 (相手が北から何度の方向にいるか)
    const bearing = calculateBearing(myLocation.lat, myLocation.lng, masterLocation.lat, masterLocation.lng);
    
    // カードの回転角度 = 相手の方向 - 自分の向いている方向
    const rotation = (bearing - myHeading + 360) % 360;
    
    // デバッグ情報表示
    if (debugInfoEl) {
        debugInfoEl.textContent = `MyDir: ${Math.round(myHeading)}° | Target: ${Math.round(bearing)}° | Rot: ${Math.round(rotation)}°`;
    }

    vivreCardEl.style.transform = `rotate(${rotation}deg)`;
    connectionStatus.textContent = '導かれています';

    // 距離
    const dist = calculateDistance(myLocation.lat, myLocation.lng, masterLocation.lat, masterLocation.lng);
    
    if (dist < 1) {
        distanceValueEl.textContent = Math.round(dist * 1000);
        distanceUnitEl.textContent = 'm';
    } else {
        distanceValueEl.textContent = dist.toFixed(1);
        distanceUnitEl.textContent = 'km';
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
