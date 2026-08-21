import { cardsSegmentClassName, cardsSegmentedClassName } from "@/components/custom/trackClasses";

/**
 * A row of choices with one of them on: the era switch and the sort order.
 *
 * Both are a single answer out of three, which is a segmented control rather
 * than a dropdown: three words fit in the bar, and a menu would hide the
 * current answer behind a press.
 */
export default function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div className={cardsSegmentedClassName} role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={cardsSegmentClassName(value === key)}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
