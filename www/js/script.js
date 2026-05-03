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
let roomType = 'standard'; // 'standard' or 'bidirectional'
let currentRoomId = null;
let myUserId = Math.random().toString(36).substring(7);
let masterLocation = null;
let myLocation = { lat: null, lng: null };
let myHeading = 0;
let signalAge = 0;
let watchId = null;
let heartbeatInterval = null;
let watchdogInterval = null;
let serverTimeOffset = 0;

// Firebase サーバー時刻とのオフセットを取得
db.ref('.info/serverTimeOffset').on('value', snapshot => {
    serverTimeOffset = snapshot.val() || 0;
});

// 現在の同期された時刻を取得するヘルパー
function getSyncedNow() {
    return Date.now() + serverTimeOffset;
}

// Capacitor Plugins
// 実行時に安全に取得するためのヘルパー
function getCapPlugin(name) {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins[name]) {
        return Capacitor.Plugins[name];
    }
    console.warn(`Capacitor Plugin "${name}" not found.`);
    return null;
}

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
    
    // 通知権限の要求 (Android 13+ でバックグラウンド通知を表示するために必要)
    if (typeof Capacitor !== 'undefined' && Capacitor.getPlatform() === 'android') {
        try {
            const LocalNotifications = getCapPlugin('LocalNotifications');
            if (LocalNotifications) {
                await LocalNotifications.requestPermissions();
            }
        } catch (e) {
            console.warn("Notification permission request failed", e);
        }
    }
    
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
    modeSelect: document.getElementById('mode-select-screen'),
    join: document.getElementById('join-screen'),
    master: document.getElementById('master-screen'),
    follower: document.getElementById('follower-screen'),
    burn: document.getElementById('burn-overlay'),
    update: document.getElementById('update-overlay')
};

const distanceValueEl = document.getElementById('distance-value');
const distanceUnitEl = document.getElementById('distance-unit');
const distanceValueMasterEl = document.getElementById('distance-value-master');
const distanceUnitMasterEl = document.getElementById('distance-unit-master');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusMaster = document.getElementById('connection-status-master');
const vivreCardEl = document.getElementById('vivre-card');
const vivreCardMasterEl = document.getElementById('vivre-card-master');
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
    const BackgroundGeolocation = getCapPlugin('BackgroundGeolocation');
    if (watchId && BackgroundGeolocation) {
        BackgroundGeolocation.removeWatcher({ id: watchId });
        watchId = null;
    }
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
    if (currentRoomId) {
        db.ref(`rooms/${currentRoomId}`).off();
        if (myMode === 'follower' || roomType === 'bidirectional') {
            db.ref(`rooms/${currentRoomId}/followers/${myUserId}`).remove();
        }
    }
    
    // 変数のリセット
    myMode = null;
    roomType = 'standard';
    currentRoomId = null;
    masterLocation = null;
    myLocation = { lat: null, lng: null };
    signalAge = 0;
    
    // UIのリセット
    document.getElementById('vivre-card').classList.remove('burning');
    document.getElementById('vivre-card-master').classList.remove('burning');
    if (debugInfoEl) debugInfoEl.textContent = '';
    
    // モード別表示のリセット
    document.getElementById('master-standard-sonar').classList.remove('hidden');
    document.getElementById('master-standard-status').classList.remove('hidden');
    document.getElementById('master-bidirectional-status').classList.add('hidden');
    document.getElementById('vivre-card-master').classList.add('hidden');
    document.getElementById('follower-bidirectional-controls').classList.add('hidden');
    document.getElementById('follower-bidirectional-tips').classList.add('hidden');
    
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
// (既に上部で宣言済み: Share, BackgroundGeolocation, LocalNotifications)

document.getElementById('mode-master-btn').addEventListener('click', () => {
    showScreen('modeSelect');
});

document.getElementById('mode-select-back-btn').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('select-standard-btn').addEventListener('click', async () => {
    roomType = 'standard';
    await startNewSession();
});

document.getElementById('select-bidirectional-btn').addEventListener('click', async () => {
    roomType = 'bidirectional';
    await startNewSession();
});

async function startNewSession() {
    myMode = 'master';
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomId = roomId;
    document.getElementById('master-room-id').textContent = roomId;
    
    await startMasterSession(roomId);
    
    // モードに応じて表示を切り替え
    if (roomType === 'bidirectional') {
        document.getElementById('master-standard-sonar').classList.add('hidden');
        document.getElementById('master-standard-status').classList.add('hidden');
        document.getElementById('master-bidirectional-status').classList.remove('hidden');
        document.getElementById('vivre-card-master').classList.remove('hidden');
    } else {
        document.getElementById('master-standard-sonar').classList.remove('hidden');
        document.getElementById('master-standard-status').classList.remove('hidden');
        document.getElementById('master-bidirectional-status').classList.add('hidden');
        document.getElementById('vivre-card-master').classList.add('hidden');
    }
    
    showScreen('master');
}

// ビブルカード（番号）共有
const shareVivreCard = async () => {
    if (!currentRoomId) return;
    
    const Share = getCapPlugin('Share');
    const shareText = `わたしのビブルカード（番号）は【${currentRoomId}】です。\nアプリを開いて入力してね！\n\nアプリを持っていない方はこちら：\n${APP_SHARE_URL}`;
    
    if (!Share) {
        try {
            await navigator.clipboard.writeText(shareText);
            alert('ビブルカードをコピーしました。LINE等に貼り付けて送ってください！');
        } catch (err) { alert(shareText); }
        return;
    }
    
    try {
        await Share.share({
            title: 'ビブルカード共有',
            text: shareText,
            dialogTitle: 'ビブルカードを仲間に送る'
        });
    } catch (e) {
        if (e.message !== 'Share canceled' && e.name !== 'AbortError') {
            console.log('Share failed', e);
            try {
                await navigator.clipboard.writeText(shareText);
                alert('ビブルカードをコピーしました。LINE等に貼り付けて送ってください！');
            } catch (err) { alert(shareText); }
        }
    }
};

document.getElementById('share-code-btn').addEventListener('click', shareVivreCard);
document.getElementById('share-code-btn-follower').addEventListener('click', shareVivreCard);

// アプリ自体の共有 (ホーム画面)
document.getElementById('share-app-btn').addEventListener('click', async () => {
    const Share = getCapPlugin('Share');
    const shareText = `大切な人へ、方位で導くアプリ「Vivre Card」\nこちらからインストールできます：\n${APP_SHARE_URL}`;
    
    if (!Share) {
        window.open(APP_SHARE_URL, '_system');
        return;
    }

    try {
        await Share.share({
            title: 'Vivre Card アプリ共有',
            text: shareText,
            url: APP_SHARE_URL,
            dialogTitle: 'Vivre Card を仲間に教える'
        });
    } catch (e) {
        if (e.message !== 'Share canceled' && e.name !== 'AbortError') {
            console.log('Share failed', e);
            try {
                await navigator.clipboard.writeText(shareText);
                alert('アプリ紹介URLをコピーしました。仲間に送ってあげてください！');
            } catch (err) { window.open(APP_SHARE_URL, '_system'); }
        }
    }
});

// 使い方ボタン
document.getElementById('how-to-use-btn').addEventListener('click', () => {
    showScreen('help');
});

document.getElementById('help-back-btn').addEventListener('click', () => {
    showScreen('home');
});

async function startMasterSession(roomId) {
    try {
        console.log("Starting master session for room:", roomId);
        const roomRef = db.ref(`rooms/${roomId}`);
        const masterPosRef = roomRef.child('master');
        const followersRef = roomRef.child('followers');

        // ★重要: update を使うことで、GPSデータが先に届いても消さないようにする
        roomRef.update({
            type: roomType,
            createdAt: Date.now(),
            status: 'active'
        }).then(() => {
            console.log("Room initialized/updated in Firebase.");
        }).catch(err => {
            console.error("Firebase update error:", err);
            // Firebaseが失敗しても画面遷移はさせる
        });

        // 自分の位置情報を定期的に更新 (バックグラウンド対応)
        const BackgroundGeolocation = getCapPlugin('BackgroundGeolocation');
        
        // ハートビート開始 (5秒おきに timestamp を更新)
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (currentRoomId) {
                masterPosRef.child('heartbeat').set(getSyncedNow());
            }
        }, 5000);

        if (BackgroundGeolocation) {
            try {
                // .then() ではなく await を使用して、Promiseを返さない環境でもエラーを防ぐ
                watchId = await BackgroundGeolocation.addWatcher(
                    {
                        backgroundMessage: "ビブルカードを共有中... 画面を閉じても共有は続きます。",
                        backgroundTitle: "Vivre Card 位置共有中",
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 2 // 2メートル移動ごとに更新
                    },
                    function callback(location, error) {
                        if (error) {
                            if (error.code === "NOT_AUTHORIZED") {
                                if (confirm("位置情報の権限が必要です。設定を開きますか？")) {
                                    BackgroundGeolocation.openSettings();
                                }
                            }
                            return console.error(error);
                        }
                        if (location) {
                            const data = { 
                                lat: location.latitude, 
                                lng: location.longitude, 
                                timestamp: Date.now()
                                // heartbeat は setInterval のみに任せることで、アプリキルを正確に検知させる
                            };
                            masterPosRef.update(data); // set ではなく update にして heartbeat を消さないようにする
                        }
                    }
                );
                console.log("BackgroundGeolocation watcher added:", watchId);
            } catch (e) {
                console.error("BackgroundGeolocation error:", e);
                alert("GPS開始エラー: " + (e.message || e));
            }
        } else {
            // プラグインがない場合のフォールバック（ブラウザ等）
            if ("geolocation" in navigator) {
                watchId = navigator.geolocation.watchPosition(pos => {
                    const data = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
                    masterPosRef.set(data);
                }, err => console.error(err), { enableHighAccuracy: true });
            }
        }

        // フォロワーの監視
        followersRef.on('value', snapshot => {
            const followers = snapshot.val();
            const count = snapshot.numChildren();
            document.getElementById('follower-count').textContent = count;

            // 双方向モード時のみ、お互いの位置を同期
            if (roomType === 'bidirectional' && followers) {
                // 自分以外の最初のフォロワーを相手として認識
                const otherFollowerId = Object.keys(followers).find(id => id !== myUserId);
                if (otherFollowerId) {
                    const followerData = followers[otherFollowerId];
                    if (followerData && typeof followerData === 'object') {
                        masterLocation = followerData;
                        masterLocation.lastHeartbeat = followerData.heartbeat || followerData.timestamp || getSyncedNow();
                        updateDisplay();
                    }
                }
            }
        });

        // 切断時にルームを削除
        roomRef.onDisconnect().remove();
    } catch (globalError) {
        console.error("startMasterSession Global Error:", globalError);
        alert("セッション開始エラー: " + globalError.message);
    }
}

document.getElementById('stop-master-btn').addEventListener('click', () => {
    if (confirm('共有を終了しますか？燃え尽きて位置が特定されなくなります')) {
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

document.getElementById('start-follow-btn').addEventListener('click', async () => {
    const roomId = document.getElementById('room-id-input').value.trim();
    if (!roomId || roomId.length !== 6) return alert('6桁のビブルカード（番号）を入力してください');
    
    await startFollowerSession(roomId);
});

async function startFollowerSession(roomId) {
    try {
        console.log("Starting follower session for room:", roomId);
        const roomRef = db.ref(`rooms/${roomId}`);
        
        // 1. 最初に入力されたルームが存在するか一度だけ確認
        const initialSnapshot = await roomRef.once('value');
        if (!initialSnapshot.exists()) {
            alert("存在しないビブルカードです。もう一度確認してください。");
            return;
        }

        myMode = 'follower';
        currentRoomId = roomId;
        document.getElementById('follower-room-id').textContent = roomId;

        const myFollowerRef = roomRef.child('followers').child(myUserId);

        // 自分の生存確認用データを登録 (位置は送らない)
        myFollowerRef.set(true);
        myFollowerRef.onDisconnect().remove();

        // 2. ルーム全体をリアルタイム監視
        roomRef.on('value', snapshot => {
            if (!snapshot.exists()) {
                if (masterLocation) triggerBurnEffect();
                else {
                    alert("ルームが終了しました。");
                    resetStateAndGoHome();
                }
                return;
            }

            const roomData = snapshot.val();
            roomType = roomData.type || 'standard';

            if (roomData.master) {
                masterLocation = roomData.master;
                // ハートビート情報の保存
                masterLocation.lastHeartbeat = roomData.master.heartbeat || roomData.master.timestamp || getSyncedNow();
                
                updateDisplay();
                showScreen('follower');
            } else {
                connectionStatus.textContent = '相手のGPS信号を待っています...';
                showScreen('follower');
            }

            // 双方向モード時の追加処理
            if (roomType === 'bidirectional') {
                document.getElementById('follower-bidirectional-controls').classList.remove('hidden');
                document.getElementById('follower-bidirectional-tips').classList.remove('hidden');
                startSendingFollowerLocation(roomRef);
            } else {
                // 通常モード時は確実に非表示にする
                document.getElementById('follower-bidirectional-controls').classList.add('hidden');
                document.getElementById('follower-bidirectional-tips').classList.add('hidden');
                // 位置情報送信も停止
                if (watchId && myMode === 'follower') {
                    const BackgroundGeolocation = getCapPlugin('BackgroundGeolocation');
                    if (BackgroundGeolocation) BackgroundGeolocation.removeWatcher({ id: watchId });
                    watchId = null;
                }
            }
        });

        // 3. ウォッチドッグ (ハートビート監視: 1秒おきにチェック)
        if (watchdogInterval) clearInterval(watchdogInterval);
        watchdogInterval = setInterval(() => {
            if (myMode === 'follower' && masterLocation && masterLocation.lastHeartbeat) {
                const now = getSyncedNow();
                const diff = now - masterLocation.lastHeartbeat;
                signalAge = Math.max(0, Math.floor(diff / 1000));
                
                // 表示更新
                updateDisplay();

                // 10秒以上更新がなければ「燃え尽き」と判定
                if (diff > 10000) {
                    console.log("Heartbeat lost (Synced). Diff:", diff);
                    clearInterval(watchdogInterval);
                    watchdogInterval = null;
                    triggerBurnEffect();
                }
            }
        }, 1000);

        // 自分の位置取得 (バックグラウンド対応)
        myLocation = { lat: null, lng: null };

        const BackgroundGeolocation = getCapPlugin('BackgroundGeolocation');
        if (watchId && BackgroundGeolocation) {
            await BackgroundGeolocation.removeWatcher({ id: watchId });
            watchId = null;
        }

        if (BackgroundGeolocation) {
            try {
                watchId = await BackgroundGeolocation.addWatcher(
                    {
                        backgroundMessage: "ビブルカードを使用中... 画面を閉じても目的地を指し示し続けます。",
                        backgroundTitle: "Vivre Card 稼働中",
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 2
                    },
                    function callback(location, error) {
                        if (error) return console.error(error);
                        if (location) {
                            myLocation = { lat: location.latitude, lng: location.longitude };
                            updateDisplay();
                        }
                    }
                );
            } catch (e) {
                console.error("Follower GPS Error:", e);
                // フォロワー側のエラーは致命的でないためalertは出さない
            }
        } else {
            // ブラウザフォールバック
            if ("geolocation" in navigator) {
                watchId = navigator.geolocation.watchPosition(pos => {
                    myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    updateDisplay();
                }, err => {
                    console.error("My GPS Error:", err);
                    connectionStatus.textContent = '自分のGPS信号を探しています...';
                }, { enableHighAccuracy: true });
            }
        }

        // コンパス
        startOrientationTracking();
    } catch (e) {
        console.error("startFollowerSession Global Error:", e);
        alert("参加エラー: " + e.message);
    }
}

function startSendingFollowerLocation(roomRef) {
    if (watchId) return; // 既に開始済み

    const myFollowerRef = roomRef.child('followers').child(myUserId);
    const BackgroundGeolocation = getCapPlugin('BackgroundGeolocation');

    if (BackgroundGeolocation) {
        BackgroundGeolocation.addWatcher(
            {
                backgroundMessage: "双方向モードで位置を共有中...",
                backgroundTitle: "Vivre Card 相互共有中",
                requestPermissions: true,
                stale: false,
                distanceFilter: 2
            },
            function callback(location, error) {
                if (error) return console.error(error);
                if (location) {
                    const data = { 
                        lat: location.latitude, 
                        lng: location.longitude, 
                        timestamp: Date.now(),
                        heartbeat: getSyncedNow()
                    };
                    myFollowerRef.update(data);
                    myLocation = { lat: location.latitude, lng: location.longitude };
                    updateDisplay();
                }
            }
        ).then(id => { watchId = id; });
    }
}

function triggerBurnEffect() {
    const card = document.getElementById('vivre-card');
    const cardMaster = document.getElementById('vivre-card-master');
    card.classList.add('burning');
    cardMaster.classList.add('burning');
    setTimeout(() => {
        showScreen('burn');
    }, 1500);
}

document.getElementById('burn-retry-btn').addEventListener('click', () => {
    // 状態をリセットして入力画面へ
    masterLocation = null;
    currentRoomId = null;
    document.getElementById('vivre-card').classList.remove('burning');
    document.getElementById('vivre-card-master').classList.remove('burning');
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
    // 通常モードかつマスターの場合は、方位計算をスキップしてソナー表示のみ維持
    if (myMode === 'master' && roomType === 'standard') {
        document.getElementById('follower-count').textContent = document.getElementById('follower-count').textContent;
        return;
    }

    // 状況を細かくユーザーに伝える
    const currentConnectionStatus = (myMode === 'master') ? connectionStatusMaster : connectionStatus;
    const currentDistanceValue = (myMode === 'master') ? distanceValueMasterEl : distanceValueEl;
    const currentDistanceUnit = (myMode === 'master') ? distanceUnitMasterEl : distanceUnitEl;
    const currentVivreCard = (myMode === 'master') ? vivreCardMasterEl : vivreCardEl;

    if (!masterLocation) {
        if (currentConnectionStatus) currentConnectionStatus.textContent = '相手のGPS信号を待っています...';
        return;
    }
    if (!myLocation.lat) {
        if (currentConnectionStatus) currentConnectionStatus.textContent = '自分のGPS信号を探しています...';
        return;
    }

    // 方位の計算
    const bearing = calculateBearing(myLocation.lat, myLocation.lng, masterLocation.lat, masterLocation.lng);
    const rotation = (bearing - myHeading + 360) % 360;
    
    // デバッグ情報表示
    if (debugInfoEl) {
        const signalColor = signalAge > 5 ? '#ff4b2b' : '#00c6ff';
        const signalStatus = signalAge > 5 ? '(Lagging)' : '(Live)';
        debugInfoEl.innerHTML = `Dir: ${Math.round(myHeading)}° | Target: ${Math.round(bearing)}° | Rot: ${Math.round(rotation)}°<br>` +
                                `<span style="color: ${signalColor}">Signal Age: ${signalAge}s ${signalStatus}</span>`;
    }

    if (currentVivreCard) currentVivreCard.style.transform = `rotate(${rotation}deg)`;
    if (currentConnectionStatus) currentConnectionStatus.textContent = '導かれています';

    // 距離
    const dist = calculateDistance(myLocation.lat, myLocation.lng, masterLocation.lat, masterLocation.lng);
    
    if (currentDistanceValue && currentDistanceUnit) {
        if (dist < 1) {
            currentDistanceValue.textContent = Math.round(dist * 1000);
            currentDistanceUnit.textContent = 'm';
        } else {
            currentDistanceValue.textContent = dist.toFixed(1);
            currentDistanceUnit.textContent = 'km';
        }
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
