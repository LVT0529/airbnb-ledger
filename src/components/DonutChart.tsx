interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  hoveredIndex?: number | null;
  onHoverChange?: (i: number | null) => void;
}

export function DonutChart({
  segments,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
  hoveredIndex = null,
  onHoverChange,
}: Props) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="donut"
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--bg-elevated)"
        strokeWidth={thickness}
      />
      {total > 0 &&
        segments.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const gap = circumference - dash;
          const isHovered = hoveredIndex === i;
          const isDimmed = hoveredIndex !== null && !isHovered;
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={isHovered ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={isDimmed ? 0.35 : 1}
              onMouseEnter={() => onHoverChange?.(i)}
              onTouchStart={() =>
                onHoverChange?.(hoveredIndex === i ? null : i)
              }
              style={{
                transition:
                  'stroke-width 0.15s ease, opacity 0.15s ease',
                cursor: onHoverChange ? 'pointer' : 'default',
              }}
            >
              <title>{`${s.label} · ${s.value.toLocaleString('ko-KR')}원`}</title>
            </circle>
          );
          offset += dash;
          return seg;
        })}
      {centerLabel && (
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="donut-center-label"
        >
          {centerLabel}
        </text>
      )}
      {centerValue && (
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          className="donut-center-value"
        >
          {centerValue}
        </text>
      )}
    </svg>
  );
}
