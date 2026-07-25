import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Tablet, AlertTriangle, RefreshCw, XCircle, Copy, Check, Sparkles, Laptop, Flame } from 'lucide-react';

/**
 * Detects if the current device is a mobile or tablet device running iOS or Android.
 */
export const detectDevice = () => {
  if (typeof window === 'undefined') {
    return { isRestricted: false, type: null, deviceLabel: 'Desktop', message: '' };
  }

  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isTouch = ('ontouchstart' in window) || maxTouchPoints > 0;
  const width = window.innerWidth;
  const screenWidth = window.screen ? window.screen.width : width;

  // 1. Check iOS (iPhone, iPad, iPod, or iPadOS desktop mode on Safari)
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || 
                (platform === 'MacIntel' && maxTouchPoints > 1) ||
                (/Macintosh/i.test(ua) && maxTouchPoints > 1);

  // 2. Check Android (Phone or Tablet)
  const isAndroid = /Android/i.test(ua);

  // 3. General Mobile / Tablet User-Agent flag
  const isMobileOrTabletUA = /Mobile|Android|iP(hone|od|ad)|IEMobile|Silk|Kindle|BlackBerry|Opera Mini|Opera Mobi|Tablet/i.test(ua);

  // Small viewport condition (<= 1024px) combined with touch or mobile UA
  const isSmallScreen = width <= 1024 || screenWidth <= 1024;

  if (isIOS) {
    return {
      isRestricted: true,
      type: 'ios',
      deviceLabel: 'iPhone / iPad (iOS)',
      message: 'sorry we dont support iphone and ipad'
    };
  }

  if (isAndroid) {
    return {
      isRestricted: true,
      type: 'android',
      deviceLabel: 'Android Phone / Tablet',
      message: 'sorry we are not on phone and tablet in android'
    };
  }

  // Fallback for generic small touch devices or browser mobile emulation
  if ((isMobileOrTabletUA || (isTouch && isSmallScreen)) && isSmallScreen) {
    const isApple = /Mac|iOS|Apple|iPhone|iPad/i.test(platform) || /Mac|iOS|Apple|iPhone|iPad/i.test(ua);
    if (isApple) {
      return {
        isRestricted: true,
        type: 'ios',
        deviceLabel: 'Apple Mobile / Tablet',
        message: 'sorry we dont support iphone and ipad'
      };
    }
    return {
      isRestricted: true,
      type: 'android',
      deviceLabel: 'Android Mobile / Tablet',
      message: 'sorry we are not on phone and tablet in android'
    };
  }

  return {
    isRestricted: false,
    type: null,
    deviceLabel: 'Desktop / Laptop',
    message: ''
  };
};

export default function DeviceRestriction({ children }) {
  const [deviceInfo, setDeviceInfo] = useState(detectDevice);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleResizeOrChange = () => {
      setDeviceInfo(detectDevice());
    };

    window.addEventListener('resize', handleResizeOrChange);
    window.addEventListener('orientationchange', handleResizeOrChange);

    return () => {
      window.removeEventListener('resize', handleResizeOrChange);
      window.removeEventListener('orientationchange', handleResizeOrChange);
    };
  }, []);

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!deviceInfo.isRestricted) {
    return <>{children}</>;
  }

  const isAndroid = deviceInfo.type === 'android';

  return (
    <div className="device-restriction-overlay">
      {/* Background ambient light effects */}
      <div className="device-ambient-blob blob-1"></div>
      <div className="device-ambient-blob blob-2"></div>

      <div className="device-restriction-card">
        {/* Top Coming Soon & Desktop Requirement Badge */}
        <div className="device-badge-row">
          <div className="device-badge warning">
            <AlertTriangle size={14} className="device-badge-icon" />
            <span>Desktop Only</span>
          </div>
          <div className="device-badge coming-soon">
            <Sparkles size={14} />
            <span>Mobile App Coming Soon 🚀</span>
          </div>
        </div>

        {/* Device Icon Illustration */}
        <div className="device-icon-container">
          <div className="device-icon-wrapper restricted">
            {isAndroid ? <Smartphone size={32} /> : <Tablet size={32} />}
            <span className="restriction-x-badge">
              <XCircle size={18} />
            </span>
          </div>
          <div className="device-arrow">➔</div>
          <div className="device-icon-wrapper allowed">
            <Monitor size={36} />
          </div>
        </div>

        {/* Primary Status Message */}
        <h1 className="device-restriction-title">
          {deviceInfo.message}
        </h1>

        {/* Funny Meme Box */}
        <div className="meme-quote-box">
          <div className="meme-quote-icon">😜</div>
          <div className="meme-quote-content">
            <h3 className="meme-tagline">"chota phone me nhi chlte ham babu!"</h3>
            <p className="meme-subtext">
              <Laptop size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              use krna hai tho laptop ya desktop use kro 🔥
            </p>
          </div>
        </div>

        {/* Detailed Status Grid */}
        <div className="device-status-grid">
          <div className="device-status-item supported">
            <div className="status-header">
              <Monitor size={16} />
              <span>Use Laptop / PC ✅</span>
            </div>
            <p>Windows, Mac, Linux, Chromebook</p>
          </div>

          <div className="device-status-item unsupported">
            <div className="status-header">
              {isAndroid ? <Smartphone size={16} /> : <Tablet size={16} />}
              <span>Mobile / Tab ❌</span>
            </div>
            <p>Coming Soon (In Development) ⌛</p>
          </div>
        </div>

        {/* Info footer & actions */}
        <div className="device-footer">
          <button className="device-action-btn primary" onClick={() => setDeviceInfo(detectDevice())}>
            <RefreshCw size={15} /> Refresh Page
          </button>
          <button className="device-action-btn secondary" onClick={handleCopyLink}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Link Copied!' : 'Copy Link for PC'}
          </button>
        </div>

        <div className="device-detected-tag">
          Detected: <span>{deviceInfo.deviceLabel}</span>
        </div>
      </div>
    </div>
  );
}
