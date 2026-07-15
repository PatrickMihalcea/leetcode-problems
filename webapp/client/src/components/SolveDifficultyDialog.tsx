import { SOLVE_DIFFICULTY_OPTIONS, solveDifficultyClass } from '../lib/solveDifficultyOptions';
import type { SolveDifficulty } from '../lib/types';

interface SolveDifficultyDialogProps {
  onSelect: (value: Exclude<SolveDifficulty, null>) => void;
  onSkip: () => void;
}

export default function SolveDifficultyDialog({ onSelect, onSkip }: SolveDifficultyDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onSkip}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <p>How difficult was it to solve?</p>
        <div className="difficulty-choices">
          {SOLVE_DIFFICULTY_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`difficulty-choice ${solveDifficultyClass(o.value)}`}
              onClick={() => onSelect(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
