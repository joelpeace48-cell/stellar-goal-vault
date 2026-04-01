export type SortOption = "newest" | "deadline" | "percentFunded" | "totalPledged";

export interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  disabled?: boolean;
}

export function SortDropdown({
  value,
  onChange,
  disabled = false,
}: SortDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
      disabled={disabled}
      aria-label="Sort campaigns"
      style={{
        padding: "8px 12px",
        border: "1px solid #cbd5e1",
        borderRadius: "12px",
        background: "#ffffff",
        font: "inherit",
        fontSize: "0.9rem",
        color: "#14213d",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <option value="newest">Newest</option>
      <option value="deadline">Deadline</option>
      <option value="percentFunded">Percent Funded</option>
      <option value="totalPledged">Total Pledged</option>
    </select>
  );
}
