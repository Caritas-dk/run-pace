import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { colors, fonts, radius, space, TOUCH } from './theme';

export function Screen({
  children,
  scroll = true,
  style,
  edges = ['bottom'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function T({
  children,
  style,
  variant = 'body',
  numberOfLines,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  variant?: 'body' | 'small' | 'label' | 'title' | 'h2' | 'display' | 'number';
  numberOfLines?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Text
      style={[styles[variant], style]}
      numberOfLines={numberOfLines}
      accessibilityLabel={accessibilityLabel}
      maxFontSizeMultiplier={variant === 'number' ? 1.4 : 2}
    >
      {children}
    </Text>
  );
}

export function Section({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHead}>
          <T variant="h2" style={{ flex: 1 }}>
            {title}
          </T>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type BtnVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
  big,
}: {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  big?: boolean;
}) {
  const v = btn[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={1200}
      style={({ pressed }) => [
        styles.btn,
        big && { minHeight: 64 },
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} color={v.fg} size={big ? 28 : 22} /> : null}
      <Text style={[styles.btnText, { color: v.fg }, big && { fontSize: 20 }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const btn: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blue, fg: colors.white, border: colors.blue },
  accent: { bg: colors.lime, fg: colors.black, border: colors.lime },
  secondary: { bg: colors.white, fg: colors.blue, border: colors.blue },
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.blue, border: 'transparent' },
};

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.blue,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }, disabled && { opacity: 0.35 }]}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  onPress,
  right,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surface }]}
    >
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.semibold }}>{title}</T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevronRight" color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function Banner({
  text,
  tone = 'warning',
  action,
}: {
  text: string;
  tone?: 'warning' | 'info' | 'danger';
  action?: { label: string; onPress: () => void };
}) {
  const bg = tone === 'warning' ? colors.warningBg : tone === 'danger' ? '#FDECEA' : colors.blueLight;
  const fg = tone === 'warning' ? colors.warningText : tone === 'danger' ? colors.danger : colors.blueDark;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon name="warning" color={fg} size={20} />
      <T style={{ color: fg, flex: 1 }}>{text}</T>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.bannerAction}>
          <Text style={[styles.btnText, { color: fg, textDecorationLine: 'underline' }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segment}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel, checked: sel }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, sel && styles.segSel]}
          >
            <Text style={[styles.segText, sel && { color: colors.white }]} maxFontSizeMultiplier={1.5}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.blue, false: colors.border }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const shown = format ? format(value) : String(value);
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
    >
      <T style={{ flex: 1 }}>{label}</T>
      <Pressable accessibilityLabel={`${label} −`} onPress={() => set(value - step)} style={styles.stepBtn} disabled={value <= min}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <T style={styles.stepValue}>{shown}</T>
      <Pressable accessibilityLabel={`${label} +`} onPress={() => set(value + step)} style={styles.stepBtn} disabled={value >= max}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  keyboardType,
  placeholder,
  style,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  error?: string | null;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  maxLength?: number;
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      <T variant="label">{label}</T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        style={[styles.input, error ? { borderColor: colors.danger, borderWidth: 2 } : null]}
      />
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

export function FieldError({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }} accessibilityRole="alert">
      <Icon name="warning" size={18} color={colors.danger} />
      <T variant="small" style={{ color: colors.danger, flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

export function Mascot({ size = 160, label }: { size?: number; label?: string }) {
  return (
    <Image
      source={require('../../assets/images/mascot.png')}
      style={{ width: size, height: size * 1.07, resizeMode: 'contain' }}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no'}
    />
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space.m, paddingVertical: space.l }}>
      <Mascot size={120} />
      <T style={{ textAlign: 'center', color: colors.textMuted }}>{text}</T>
    </View>
  );
}

export function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 120 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <T variant="small">{label}</T>
      <T variant="number" style={big ? { fontSize: 30 } : null}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: space.l, gap: space.l, paddingBottom: space.xxl },
  body: { fontFamily: fonts.regular, fontSize: 16, color: colors.text, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, lineHeight: 19 },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.blue, textTransform: 'uppercase' },
  h2: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  display: { fontFamily: fonts.display, fontSize: 88, color: colors.text, lineHeight: 96 },
  number: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'] },
  section: { gap: space.s },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.l,
    gap: space.m,
  },
  btn: {
    minHeight: TOUCH,
    borderRadius: radius.m,
    borderWidth: 2,
    paddingHorizontal: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
  btnText: { fontFamily: fonts.bold, fontSize: 17 },
  iconBtn: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  banner: { flexDirection: 'row', gap: space.s, alignItems: 'center', padding: space.m, borderRadius: radius.m },
  bannerAction: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.s },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  segItem: {
    minHeight: TOUCH,
    paddingHorizontal: space.m,
    borderRadius: radius.m,
    borderWidth: 2,
    borderColor: colors.blue,
    justifyContent: 'center',
    flexGrow: 1,
    alignItems: 'center',
  },
  segSel: { backgroundColor: colors.blue },
  segText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.blue },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, gap: space.m },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: TOUCH },
  stepBtn: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.m,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: fonts.bold, fontSize: 24, color: colors.blue },
  stepValue: { minWidth: 72, textAlign: 'center', fontFamily: fonts.bold },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    paddingHorizontal: space.m,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.white,
  },
});
