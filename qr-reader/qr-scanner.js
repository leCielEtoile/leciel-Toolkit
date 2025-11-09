/**
 * QRコード読み取りツール
 * jsQRライブラリを使用してクライアントサイドでQRコードを読み取る
 */

import { initDarkMode } from '../components/dark-mode.js';

// jsQRライブラリを動的にインポート
const jsQR = await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').then(module => module.default);

// DOM要素
const cameraButton = document.getElementById('cameraButton');
const fileButton = document.getElementById('fileButton');
const fileInput = document.getElementById('fileInput');
const cameraSection = document.getElementById('cameraSection');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const stopCameraButton = document.getElementById('stopCameraButton');
const resultSection = document.getElementById('resultSection');
const resultText = document.getElementById('resultText');
const copyButton = document.getElementById('copyButton');
const message = document.getElementById('message');

let stream = null;
let scanningInterval = null;

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
  resultText.textContent = data;
  resultSection.classList.remove('hidden');
  showMessage('QRコードを読み取りました！');
}

/**
 * カメラを開始
 */
async function startCamera() {
  try {
    // カメラアクセスを要求
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' } // 背面カメラを優先
    });

    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    video.play();

    cameraSection.classList.remove('hidden');

    // ビデオの準備ができたらスキャンを開始
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      startScanning();
    });

  } catch (error) {
    console.error('カメラエラー:', error);
    if (error.name === 'NotAllowedError') {
      showMessage('カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。', 'error');
    } else if (error.name === 'NotFoundError') {
      showMessage('カメラが見つかりませんでした。', 'error');
    } else {
      showMessage(`カメラの起動に失敗しました: ${error.message}`, 'error');
    }
  }
}

/**
 * カメラを停止
 */
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
  }

  video.srcObject = null;
  cameraSection.classList.add('hidden');
}

/**
 * QRコードスキャンを開始
 */
function startScanning() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  scanningInterval = setInterval(() => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        displayResult(code.data);
        stopCamera();
      }
    }
  }, 300); // 300msごとにスキャン
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
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          displayResult(code.data);
        } else {
          showMessage('QRコードが見つかりませんでした。別の画像をお試しください。', 'error');
        }
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  } catch (error) {
    console.error('ファイル読み取りエラー:', error);
    showMessage(`ファイルの読み取りに失敗しました: ${error.message}`, 'error');
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
    console.error('コピーエラー:', error);
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
window.addEventListener('beforeunload', () => {
  stopCamera();
});

// ダークモード初期化
initDarkMode('toggleDarkMode');
