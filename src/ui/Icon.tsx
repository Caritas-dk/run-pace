import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'up'
  | 'down'
  | 'check'
  | 'pause'
  | 'play'
  | 'stop'
  | 'star'
  | 'starOutline'
  | 'plus'
  | 'trash'
  | 'copy'
  | 'chevronUp'
  | 'chevronDown'
  | 'chevronRight'
  | 'gps'
  | 'sound'
  | 'soundOff'
  | 'settings'
  | 'history'
  | 'repeat'
  | 'warning'
  | 'edit'
  | 'close';

export function Icon({ name, size = 24, color = '#111111' }: { name: IconName; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'up':
      body = <Path d="M12 19V5M5 12l7-7 7 7" {...p} />;
      break;
    case 'down':
      body = <Path d="M12 5v14M19 12l-7 7-7-7" {...p} />;
      break;
    case 'check':
      body = <Path d="M4 12.5l5 5L20 6.5" {...p} />;
      break;
    case 'pause':
      body = (
        <>
          <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
          <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
        </>
      );
      break;
    case 'play':
      body = <Path d="M7 4.5v15l12-7.5z" fill={color} />;
      break;
    case 'stop':
      body = <Rect x="5.5" y="5.5" width="13" height="13" rx="2" fill={color} />;
      break;
    case 'star':
      body = <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />;
      break;
    case 'starOutline':
      body = <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z" {...p} strokeWidth={1.8} />;
      break;
    case 'plus':
      body = <Path d="M12 5v14M5 12h14" {...p} />;
      break;
    case 'trash':
      body = <Path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" {...p} />;
      break;
    case 'copy':
      body = (
        <>
          <Rect x="8" y="8" width="12" height="12" rx="2" {...p} />
          <Path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" {...p} />
        </>
      );
      break;
    case 'chevronUp':
      body = <Path d="M6 15l6-6 6 6" {...p} />;
      break;
    case 'chevronDown':
      body = <Path d="M6 9l6 6 6-6" {...p} />;
      break;
    case 'chevronRight':
      body = <Path d="M9 6l6 6-6 6" {...p} />;
      break;
    case 'gps':
      body = (
        <>
          <Circle cx="12" cy="12" r="7" {...p} />
          <Circle cx="12" cy="12" r="2.5" fill={color} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...p} />
        </>
      );
      break;
    case 'sound':
      body = <Path d="M4 9.5h4L13 5v14l-5-4.5H4zM16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11" {...p} />;
      break;
    case 'soundOff':
      body = <Path d="M4 9.5h4L13 5v14l-5-4.5H4zM17 9.5l5 5M22 9.5l-5 5" {...p} />;
      break;
    case 'settings':
      body = (
        <>
          <Circle cx="12" cy="12" r="3" {...p} />
          <Path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" {...p} />
        </>
      );
      break;
    case 'history':
      body = <Path d="M3.5 12a8.5 8.5 0 102.5-6M3.5 4v4h4M12 7.5V12l3 2" {...p} />;
      break;
    case 'repeat':
      body = <Path d="M17 2.5l3 3-3 3M4 11V9.5a4 4 0 014-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 01-4 4H4" {...p} />;
      break;
    case 'warning':
      body = <Path d="M12 3.5L2.5 20h19zM12 10v4.5M12 17.5v.01" {...p} />;
      break;
    case 'edit':
      body = <Path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" {...p} />;
      break;
    case 'close':
      body = <Path d="M6 6l12 12M18 6L6 18" {...p} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {body}
    </Svg>
  );
}
