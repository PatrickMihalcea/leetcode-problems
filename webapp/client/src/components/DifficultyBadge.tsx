export default function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const cls =
    difficulty === 'Easy' ? 'badge badge-easy' : difficulty === 'Hard' ? 'badge badge-hard' : 'badge badge-medium';
  return <span className={cls}>{difficulty}</span>;
}
