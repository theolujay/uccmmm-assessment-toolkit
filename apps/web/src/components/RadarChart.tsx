import type { DimensionScore } from '@assessment/contracts';

const chartSize = 300;
const center = chartSize / 2;
const chartRadius = 100;

function pointFor(index: number, ratio: number): [number, number] {
  const angle = (-Math.PI / 2) + (index * (Math.PI * 2 / 6));
  return [center + Math.cos(angle) * chartRadius * ratio, center + Math.sin(angle) * chartRadius * ratio];
}

function pointsFor(ratio: number): string {
  return Array.from({ length: 6 }, (_, index) => pointFor(index, ratio).join(',')).join(' ');
}

export function RadarChart({ scores }: { scores: readonly DimensionScore[] }) {
  const values = Array.from({ length: 6 }, (_, index) => scores[index]?.scorePercentage ?? 0);
  return <svg className="radar-chart" viewBox={`0 0 ${chartSize} ${chartSize}`} role="img" aria-label="Maturity scores across six UCCMM dimensions">
    <title>Six-dimension maturity profile</title>
    {[0.25, 0.5, 0.75, 1].map((ratio) => <polygon className="radar-grid" key={ratio} points={pointsFor(ratio)} />)}
    {Array.from({ length: 6 }, (_, index) => {
      const [x, y] = pointFor(index, 1);
      return <line className="radar-axis" key={index} x1={center} y1={center} x2={x} y2={y} />;
    })}
    <polygon className="radar-shape" points={values.map((value, index) => pointFor(index, value / 100).join(',')).join(' ')} />
    {scores.map((score, index) => {
      const [x, y] = pointFor(index, 1.18);
      return <text className="radar-label" key={score.dimensionId} x={x} y={y}>{score.dimensionName.split(',')[0]}</text>;
    })}
  </svg>;
}
