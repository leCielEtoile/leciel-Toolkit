/**
 * QRコード読み取りツール
 * html5-qrcodeライブラリを使用してクライアントサイドでQRコードを読み取る
 */

import { initDarkMode } from '../components/dark-mode.js';

// デバッグモード（本番環境では false に設定）
const DEBUG = false;

// html5-qrcodeライブラリをグローバルスコープから取得
let Html5Qrcode = null;

// html5-qrcodeライブラリを動的にロード
async function loadHtml5Qrcode() {
  if (window.Html5Qrcode) {
    Html5Qrcode = window.Html5Qrcode;
    return;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.integrity = 'sha256-ZgsSQ3sddH4+aLi+BoXAjLcoFAEQrSE/FnsUtm+LHY4=';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      Html5Qrcode = window.Html5Qrcode;
      resolve();
    };
    script.onerror = () => reject(new Error('html5-qrcodeライブラリの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

// DOM要素
const cameraButton = document.getElementById('cameraButton');
const fileButton = document.getElementById('fileButton');
const fileInput = document.getElementById('fileInput');
const cameraSection = document.getElementById('cameraSection');
const stopCameraButton = document.getElementById('stopCameraButton');
const resultSection = document.getElementById('resultSection');
const resultText = document.getElementById('resultText');
const copyButton = document.getElementById('copyButton');
const message = document.getElementById('message');

// html5-qrcodeインスタンス
let html5QrCode = null;
let isScanning = false;

/**
 * メッセージを表示
 * @param {string} text - 表示するテキスト
 * @param {string} type - メッセージのタイプ（'success' または 'error'）
 */
function showMessage(text, type = 'success') {
  message.textContent = text;
  message.className = type;
  message.style.display = 'block';
  message.setAttribute('role', 'alert');
  setTimeout(() => {
    message.style.display = 'none';
    message.removeAttribute('role');
  }, 5000);
}

/**
 * 結果を表示
 * @param {string} data - QRコードから読み取ったデータ
 */
function displayResult(data) {
  if (DEBUG) console.log('QRコード読み取り成功:', data);

  if (!resultText || !resultSection) {
    if (DEBUG) console.error('DOM要素が見つかりません');
    showMessage('エラー: 結果表示エリアが見つかりません', 'error');
    return;
  }

  // 結果テキストを設定
  resultText.textContent = data || '(空のデータ)';

  // hiddenクラスを削除して表示
  resultSection.classList.remove('hidden');
  resultSection.style.display = 'block';

  // 結果セクションにスクロール
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  showMessage('QRコードを読み取りました！');
}

/**
 * カメラを開始
 */
async function startCamera() {
  try {
    // html5-qrcodeライブラリを読み込み
    if (!Html5Qrcode) {
      await loadHtml5Qrcode();
    }

    // インスタンスを作成（div要素のIDを指定）
    html5QrCode = new Html5Qrcode('qr-reader');

    // カメラセクションを表示
    cameraSection.classList.remove('hidden');

    // カメラを起動
    const config = {
      fps: 10,    // 1秒間に10フレームスキャン
      qrbox: { width: 250, height: 250 },  // スキャンボックスのサイズ
      aspectRatio: 1.777778  // 16:9
    };

    // 成功時のコールバック
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      if (DEBUG) console.log('QRコード検出:', decodedText);
      displayResult(decodedText);
      stopCamera();
    };

    // エラー時のコールバック（検出できない場合は頻繁に呼ばれるので無視）
    const qrCodeErrorCallback = (errorMessage) => {
      // スキャン中のエラーは無視（QRコードが見つからない状態）
    };

    // 背面カメラを優先して起動
    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      qrCodeSuccessCallback,
      qrCodeErrorCallback
    );

    isScanning = true;
    if (DEBUG) console.log('カメラスキャン開始');

  } catch (error) {
    if (DEBUG) console.error('カメラエラー:', error);

    if (error.name === 'NotAllowedError') {
      showMessage('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。', 'error');
    } else if (error.name === 'NotFoundError') {
      showMessage('カメラが見つかりませんでした。', 'error');
    } else {
      showMessage(`カメラの起動に失敗しました: ${error.message}`, 'error');
    }

    cameraSection.classList.add('hidden');
  }
}

/**
 * カメラを停止
 */
async function stopCamera() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      if (DEBUG) console.log('カメラ停止');
      isScanning = false;
    } catch (error) {
      if (DEBUG) console.error('カメラ停止エラー:', error);
    }
  }

  cameraSection.classList.add('hidden');
}

/**
 * 画像ファイルからQRコードを読み取る
 * @param {File} file - 画像ファイル
 */
async function scanFromFile(file) {
  if (!file.type.match(/^image\//)) {
    showMessage('画像ファイルを選択してください', 'error');
    return;
  }

  try {
    // html5-qrcodeライブラリを読み込み
    if (!Html5Qrcode) {
      await loadHtml5Qrcode();
    }

    // インスタンスを作成（ファイルスキャン用）
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('qr-reader');
    }

    // ファイルをスキャン
    const decodedText = await html5QrCode.scanFile(file, true);

    if (DEBUG) console.log('ファイルからQRコード検出:', decodedText);
    displayResult(decodedText);

  } catch (error) {
    if (DEBUG) console.error('ファイル読み取りエラー:', error);

    if (error.includes && error.includes('QR code parse error')) {
      showMessage('QRコードが見つかりませんでした。別の画像をお試しください。', 'error');
    } else {
      showMessage(`ファイルの読み取りに失敗しました: ${error}`, 'error');
    }
  }
}

/**
 * テキストをクリップボードにコピー
 */
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(resultText.textContent);
    showMessage('クリップボードにコピーしました！');
  } catch (error) {
    if (DEBUG) console.error('コピーエラー:', error);
    // フォールバック: 古いブラウザ向け
    const textArea = document.createElement('textarea');
    textArea.value = resultText.textContent;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showMessage('クリップボードにコピーしました！');
    } catch (err) {
      showMessage('クリップボードへのコピーに失敗しました', 'error');
    }
    document.body.removeChild(textArea);
  }
}

// イベントリスナー
cameraButton.addEventListener('click', startCamera);
fileButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    scanFromFile(e.target.files[0]);
  }
});
stopCameraButton.addEventListener('click', stopCamera);
copyButton.addEventListener('click', copyToClipboard);

// ページを離れる前にカメラを停止
window.addEventListener('beforeunload', async () => {
  await stopCamera();
});

// 初期化処理
(async function init() {
  if (DEBUG) console.log('QRコード読み取りツール初期化開始');

  // html5-qrcodeライブラリを事前に読み込み
  try {
    await loadHtml5Qrcode();
    if (DEBUG) console.log('html5-qrcodeライブラリを読み込みました:', Html5Qrcode);
  } catch (error) {
    if (DEBUG) console.error('html5-qrcodeライブラリの読み込みエラー:', error);
    if (message) {
      showMessage('QRコード読み取りライブラリの読み込みに失敗しました', 'error');
    }
  }

  // ダークモード初期化
  try {
    initDarkMode('toggleDarkMode');
    if (DEBUG) console.log('ダークモード初期化完了');
  } catch (error) {
    if (DEBUG) console.error('ダークモード初期化エラー:', error);
  }

  if (DEBUG) console.log('初期化処理完了');
})();
