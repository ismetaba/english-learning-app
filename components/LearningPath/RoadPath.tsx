/**
 * RoadPath — Simple clean curved line connecting lesson nodes.
 * Solid line for completed, dashed for upcoming. Chill and minimal.
 */
import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { palette } from '@/constants/Colors';

const SCREEN_W = Dimensions.get('window').width;
export const NODE_SPACING = 180;
const MARGIN = 75;
const GAP = 100; // gap from circle center — line must start below title + badges

interface RoadPathProps {
  nodeCount: number;
  completedCount: number;
  color: string;
}

function getPositions(count: number) {
  const leftX = MARGIN;
  const rightX = SCREEN_W - MARGIN;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({ x: i % 2 === 0 ? leftX : rightX, y: 50 + i * NODE_SPACING });
  }
  return positions;
}

function segmentPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  // Start/end with gap from circle centers
  const fy = from.y + GAP;
  const ty = to.y - GAP;
  // Simple relaxed cubic bezier
  const midY = (fy + ty) / 2;
  return `M ${from.x} ${fy} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${ty}`;
}

export function useRoadPositions(nodeCount: number) {
  return { positions: getPositions(nodeCount), totalHeight: nodeCount * NODE_SPACING + 80 };
}

export default function RoadPath({ nodeCount, completedCount, color }: RoadPathProps) {
  const positions = getPositions(nodeCount);
  const totalHeight = nodeCount * NODE_SPACING + 80;

  return (
    <View style={[styles.container, { height: totalHeight }]}>
      <Svg width={SCREEN_W} height={totalHeight} style={StyleSheet.absoluteFill}>
        {positions.map((pos, i) => {
          if (i >= positions.length - 1) return null;
          const next = positions[i + 1];
          const d = segmentPath(pos, next);
          const done = i < completedCount;

          return (
            <Path
              key={i}
              d={d}
              stroke={done ? color : palette.textDisabled}
              strokeWidth={done ? 2.5 : 2}
              strokeLinecap="round"
              strokeDasharray={done ? undefined : '8,10'}
              fill="none"
              opacity={done ? 0.6 : 0.2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0 },
});
