import React, { useMemo, useState } from 'react';
import { View, Text, useWindowDimensions, StyleSheet, Modal, Image, Pressable, ScrollView } from 'react-native';
import Svg, { Rect, Text as SvgText, G, Path } from 'react-native-svg';
import type { ContestMatch, ContestMatchParticipant } from '../types/contests.types';

interface TournamentBracketProps {
  matches: ContestMatch[];
  onMatchPress?: (match: ContestMatch) => void;
  isDark?: boolean;
  myRegistrationId?: string;
}

const MARGIN_LEFT = 16;
const MARGIN_TOP = 20;

export const TournamentBracket: React.FC<TournamentBracketProps> = ({ matches, onMatchPress, isDark = false, myRegistrationId }) => {
  const { width: windowWidth } = useWindowDimensions();
  const [selectedMatch, setSelectedMatch] = useState<ContestMatch | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleMatchClick = (match: ContestMatch) => {
    setSelectedMatch(match);
    setDetailModalOpen(true);
  };

  // Nhóm các trận đấu theo vòng (round_no)
  const { rounds, maxRoundNo, totalMatches } = useMemo(() => {
    const mainMatches = matches.filter((m) => !m.metadata?.third_place);
    const roundGroups: { [key: number]: ContestMatch[] } = {};
    let maxRound = 1;

    mainMatches.forEach((m) => {
      if (!roundGroups[m.round_no]) {
        roundGroups[m.round_no] = [];
      }
      roundGroups[m.round_no].push(m);
      if (m.round_no > maxRound) {
        maxRound = m.round_no;
      }
    });

    // Sắp xếp các trận trong từng vòng theo match_no
    Object.keys(roundGroups).forEach((r) => {
      roundGroups[Number(r)].sort((a, b) => a.match_no - b.match_no);
    });

    return {
      rounds: roundGroups,
      maxRoundNo: maxRound,
      totalMatches: mainMatches.length,
    };
  }, [matches]);

  // Tính toán kích thước node động dựa trên số vòng đấu để đảm bảo vừa khít màn hình không cần kéo ngang
  const { nodeWidth, nodeHeight, columnGap, rowGap } = useMemo(() => {
    const numCols = maxRoundNo;
    if (numCols <= 2) {
      // Giải đấu nhỏ (4 VĐV): Dùng kích thước lớn rộng rãi
      return {
        nodeWidth: 150,
        nodeHeight: 64,
        columnGap: 36,
        rowGap: 40, // Giãn rộng dọc để sơ đồ trông bự và hoành tráng
      };
    } else if (numCols === 3) {
      // Giải đấu vừa (8 VĐV): Dùng kích thước Compact tối ưu nhưng giãn chiều dọc
      return {
        nodeWidth: 114,
        nodeHeight: 50,
        columnGap: 16,
        rowGap: 28, // Tăng khoảng cách dòng giúp sơ đồ bự hơn và chữ to hơn
      };
    } else {
      // Giải đấu lớn (16 VĐV đến 32 VĐV trở lên): Bật chế độ cuộn ngang, dùng kích thước to rõ, chuyên nghiệp
      return {
        nodeWidth: 136,
        nodeHeight: 54,
        columnGap: 36,
        rowGap: 20, // Khoảng cách dòng vừa phải vì có nhiều trận xếp dọc
      };
    }
  }, [maxRoundNo]);

  // Tính toán tọa độ của từng trận đấu trong sơ đồ
  const matchCoords = useMemo(() => {
    const coords: { [matchId: string]: { x: number; y: number } } = {};
    if (totalMatches === 0) return coords;

    const r1Matches = rounds[1] || [];
    const r1Height = nodeHeight + rowGap;
    r1Matches.forEach((match, idx) => {
      coords[match.id] = {
        x: MARGIN_LEFT,
        y: MARGIN_TOP + idx * r1Height,
      };
    });

    for (let r = 2; r <= maxRoundNo; r++) {
      const rMatches = rounds[r] || [];
      const prevRoundMatches = rounds[r - 1] || [];
      const colX = MARGIN_LEFT + (r - 1) * (nodeWidth + columnGap);

      rMatches.forEach((match) => {
        const sources = prevRoundMatches.filter((m) => m.next_match_id === match.id);
        let sourceMatch1: ContestMatch | undefined = sources[0];
        let sourceMatch2: ContestMatch | undefined = sources[1];

        if (!sourceMatch1) {
          sourceMatch1 = prevRoundMatches.find((m) => m.match_no === match.match_no * 2 - 1);
        }
        if (!sourceMatch2) {
          sourceMatch2 = prevRoundMatches.find((m) => m.match_no === match.match_no * 2);
        }

        let y = MARGIN_TOP;
        if (sourceMatch1 && sourceMatch2 && coords[sourceMatch1.id] && coords[sourceMatch2.id]) {
          y = (coords[sourceMatch1.id].y + coords[sourceMatch2.id].y) / 2;
        } else if (sourceMatch1 && coords[sourceMatch1.id]) {
          y = coords[sourceMatch1.id].y;
        } else {
          const idx = match.match_no - 1;
          const scaleOffset = Math.pow(2, r - 1);
          y = MARGIN_TOP + idx * r1Height * scaleOffset + (r1Height * (scaleOffset - 1)) / 2;
        }

        coords[match.id] = { x: colX, y };
      });
    }

    return coords;
  }, [rounds, maxRoundNo, totalMatches, nodeHeight, rowGap, nodeWidth, columnGap]);

  // Chiều rộng và chiều cao tổng của khung canvas SVG gốc
  const { canvasWidth, canvasHeight } = useMemo(() => {
    if (totalMatches === 0) return { canvasWidth: windowWidth, canvasHeight: 200 };
    const numCols = maxRoundNo;
    const colWidth = nodeWidth + columnGap;
    const w = MARGIN_LEFT + numCols * colWidth - columnGap + MARGIN_LEFT;

    const r1Count = rounds[1]?.length || 1;
    const h = MARGIN_TOP + r1Count * (nodeHeight + rowGap) - rowGap + MARGIN_TOP;

    return { canvasWidth: w, canvasHeight: h };
  }, [rounds, maxRoundNo, totalMatches, windowWidth, nodeWidth, columnGap, nodeHeight, rowGap]);

  // Tính toán kích thước hiển thị tự động co giãn vừa khít màn hình
  const { containerWidth, displayHeight } = useMemo(() => {
    const padding = 32; // Trừ đi padding hai bên của màn hình cha
    const cWidth = windowWidth - padding;
    const ratio = cWidth / canvasWidth;
    const dHeight = canvasHeight * ratio;
    return { containerWidth: cWidth, displayHeight: dHeight };
  }, [canvasWidth, canvasHeight, windowWidth]);

  const getParticipantName = (p: ContestMatchParticipant | undefined) => {
    if (!p) return 'Chờ vòng trước';
    return p.registration?.participant_name || p.registration?.driver_handle || 'Ẩn danh';
  };

  const getParticipantFontSize = (p: ContestMatchParticipant | undefined) => {
    if (!p) return 8;
    const name = p.registration?.participant_name || p.registration?.driver_handle || 'Ẩn danh';
    const len = name.length;
    // Tự động scale nhỏ cỡ chữ dựa trên độ dài của tên để không bị tràn card
    if (len <= 8) return 9.5;
    if (len <= 12) return 8.5;
    if (len <= 16) return 7.5;
    return 6.5;
  };

  const getParticipantColor = (p: ContestMatchParticipant | undefined) => {
    if (!p) return '#94a3b8';
    if (p.is_winner) return isDark ? '#34d399' : '#047857';
    return isDark ? '#cbd5e1' : '#334155';
  };

  const getParticipantFontWeight = (p: ContestMatchParticipant | undefined) => {
    if (p && p.is_winner) return 'bold';
    return 'normal';
  };

  // Chiều cao Header và các dòng đấu thủ tính toán động theo nodeHeight
  const headerHeight = 16;
  const rowHeight = (nodeHeight - headerHeight) / 2;
  const p1Y = headerHeight;
  const p2Y = headerHeight + rowHeight;
  const separator1Y = headerHeight;
  const separator2Y = headerHeight + rowHeight;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {totalMatches === 0 ? (
        <View className="py-12 items-center justify-center">
          <Text className="text-sm font-bold text-gray-400 dark:text-slate-500 italic">Chưa bốc thăm nên chưa có sơ đồ nhánh đấu.</Text>
        </View>
      ) : (
        /* Nếu giải lớn (>= 4 vòng - 16 VĐV trở lên), hiển thị Scroll ngang kích thước gốc để đọc rõ chữ. Nếu giải nhỏ, co giãn fit màn hình dọc */
        maxRoundNo >= 4 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            <View style={{ width: canvasWidth, height: canvasHeight }}>
              <Svg
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              >
                <G>
                  {/* 1. Vẽ các đường nối (Connector Lines) trước */}
                  {Object.keys(rounds).map((rStr) => {
                    const r = Number(rStr);
                    const roundMatches = rounds[r] || [];
                    if (r === maxRoundNo) return null;

                    return roundMatches.map((match) => {
                      const startCoord = matchCoords[match.id];
                      if (!startCoord) return null;

                      const x1 = startCoord.x + nodeWidth;
                      const y1 = startCoord.y + nodeHeight / 2;

                      const nextMatch = matches.find((m) => m.id === match.next_match_id);
                      if (!nextMatch) return null;

                      const endCoord = matchCoords[nextMatch.id];
                      if (!endCoord) return null;

                      const x2 = endCoord.x;
                      const y2 = endCoord.y + nodeHeight / 2;

                      const xMid = (x1 + x2) / 2;
                      const pathData = `M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`;

                      return (
                        <Path
                          key={`line-${match.id}`}
                          d={pathData}
                          fill="none"
                          stroke={isDark ? '#334155' : '#cbd5e1'}
                          strokeWidth="1.8"
                        />
                      );
                    })
                  })}

                  {/* 2. Vẽ các Card trận đấu */}
                  {matches
                    .filter((m) => !m.metadata?.third_place)
                    .map((match) => {
                      const coord = matchCoords[match.id];
                      if (!coord) return null;

                      const p1 = match.participants.find((p) => p.slot_no === 1);
                      const p2 = match.participants.find((p) => p.slot_no === 2);
                      const isBye = match.metadata?.bye;
                      const isLive = match.status === 'RUNNING';

                      const isMeP1 = Boolean(
                        myRegistrationId &&
                        p1 &&
                        (p1.registration_id === myRegistrationId || p1.registration?.id === myRegistrationId)
                      );
                      const isMeP2 = Boolean(
                        myRegistrationId &&
                        p2 &&
                        (p2.registration_id === myRegistrationId || p2.registration?.id === myRegistrationId)
                      );

                      const cardBorderColor = isLive ? '#ea580c' : (isDark ? '#334155' : '#e2e8f0');
                      const cardBgColor = isDark ? '#1e293b' : '#ffffff';

                      return (
                        <G 
                          key={match.id} 
                          transform={`translate(${coord.x}, ${coord.y})`}
                          onPress={() => handleMatchClick(match)}
                        >
                          <Rect
                            x="0"
                            y="0"
                            width={nodeWidth}
                            height={nodeHeight}
                            rx="6"
                            ry="6"
                            fill={cardBgColor}
                            stroke={cardBorderColor}
                            strokeWidth={isLive ? '1.8' : '1'}
                          />

                          <Rect
                            x="1"
                            y="1"
                            width={nodeWidth - 2}
                            height={headerHeight}
                            rx="4"
                            ry="4"
                            fill={isDark ? '#0f172a' : '#f8fafc'}
                          />
                          <SvgText
                            x="6"
                            y={headerHeight - 4}
                            fontSize="8.5"
                            fontWeight="bold"
                            fill={isDark ? '#94a3b8' : '#64748b'}
                          >
                            {match.name || `Trận ${match.match_no}`}
                          </SvgText>

                          <Path d={`M 1 ${separator1Y} H ${nodeWidth - 1}`} stroke={isDark ? '#1e293b' : '#f1f5f9'} strokeWidth="1" />

                          <Rect
                            x="2"
                            y={p1Y}
                            width={nodeWidth - 4}
                            height={rowHeight - 1}
                            fill={p1?.is_winner ? (isDark ? 'rgba(4, 120, 87, 0.2)' : '#ecfdf5') : 'transparent'}
                            rx="3"
                            ry="3"
                          />
                          <SvgText
                            x="6"
                            y={p1Y + rowHeight - 4}
                            fontSize={String(getParticipantFontSize(p1))}
                            fontWeight={getParticipantFontWeight(p1)}
                            fill={getParticipantColor(p1)}
                          >
                            {getParticipantName(p1)}
                          </SvgText>
                          {p1?.is_winner && (
                            <SvgText x={nodeWidth - 14} y={p1Y + rowHeight - 4} fontSize="8">🏆</SvgText>
                          )}
                          {isMeP1 && (
                            <G>
                              <Rect
                                x={nodeWidth - (p1?.is_winner ? 34 : 22)}
                                y={p1Y + rowHeight - 11}
                                width="18"
                                height="8.5"
                                rx="2"
                                ry="2"
                                fill="#fff7ed"
                                stroke="#ea580c"
                                strokeWidth="0.5"
                              />
                              <SvgText
                                x={nodeWidth - (p1?.is_winner ? 31 : 19)}
                                y={p1Y + rowHeight - 4}
                                fontSize="6"
                                fontWeight="bold"
                                fill="#ea580c"
                              >
                                Bạn
                              </SvgText>
                            </G>
                          )}

                          <Path d={`M 4 ${separator2Y} H ${nodeWidth - 4}`} stroke={isDark ? '#0f172a' : '#f1f5f9'} strokeWidth="1" />

                          <Rect
                            x="2"
                            y={p2Y}
                            width={nodeWidth - 4}
                            height={rowHeight - 1}
                            fill={p2?.is_winner ? (isDark ? 'rgba(4, 120, 87, 0.2)' : '#ecfdf5') : 'transparent'}
                            rx="3"
                            ry="3"
                          />
                          <SvgText
                            x="6"
                            y={p2Y + rowHeight - 4}
                            fontSize={String(getParticipantFontSize(p2))}
                            fontWeight={getParticipantFontWeight(p2)}
                            fill={getParticipantColor(p2)}
                          >
                            {isBye && !p2 ? 'Không có đối thủ' : getParticipantName(p2)}
                          </SvgText>
                          {p2?.is_winner && (
                            <SvgText x={nodeWidth - 14} y={p2Y + rowHeight - 4} fontSize="8">🏆</SvgText>
                          )}
                          {isMeP2 && (
                            <G>
                              <Rect
                                x={nodeWidth - (p2?.is_winner ? 34 : 22)}
                                y={p2Y + rowHeight - 11}
                                width="18"
                                height="8.5"
                                rx="2"
                                ry="2"
                                fill="#fff7ed"
                                stroke="#ea580c"
                                strokeWidth="0.5"
                              />
                              <SvgText
                                x={nodeWidth - (p2?.is_winner ? 31 : 19)}
                                y={p2Y + rowHeight - 4}
                                fontSize="6"
                                fontWeight="bold"
                                fill="#ea580c"
                              >
                                Bạn
                              </SvgText>
                            </G>
                          )}
                        </G>
                      );
                    })}
                </G>
              </Svg>
            </View>
          </ScrollView>
        ) : (
          <View style={{ width: containerWidth, height: displayHeight, overflow: 'hidden' }}>
            <Svg
              width={containerWidth}
              height={displayHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <G>
                {/* 1. Vẽ các đường nối (Connector Lines) trước */}
                {Object.keys(rounds).map((rStr) => {
                  const r = Number(rStr);
                  const roundMatches = rounds[r] || [];
                  if (r === maxRoundNo) return null;

                  return roundMatches.map((match) => {
                    const startCoord = matchCoords[match.id];
                    if (!startCoord) return null;

                    const x1 = startCoord.x + nodeWidth;
                    const y1 = startCoord.y + nodeHeight / 2;

                    const nextMatch = matches.find((m) => m.id === match.next_match_id);
                    if (!nextMatch) return null;

                    const endCoord = matchCoords[nextMatch.id];
                    if (!endCoord) return null;

                    const x2 = endCoord.x;
                    const y2 = endCoord.y + nodeHeight / 2;

                    const xMid = (x1 + x2) / 2;
                    const pathData = `M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`;

                    return (
                      <Path
                        key={`line-${match.id}`}
                        d={pathData}
                        fill="none"
                        stroke={isDark ? '#334155' : '#cbd5e1'}
                        strokeWidth="1.8"
                      />
                    );
                  })
                })}

                {/* 2. Vẽ các Card trận đấu */}
                {matches
                  .filter((m) => !m.metadata?.third_place)
                  .map((match) => {
                    const coord = matchCoords[match.id];
                    if (!coord) return null;

                    const p1 = match.participants.find((p) => p.slot_no === 1);
                    const p2 = match.participants.find((p) => p.slot_no === 2);
                    const isBye = match.metadata?.bye;
                    const isLive = match.status === 'RUNNING';

                    const isMeP1 = Boolean(
                      myRegistrationId &&
                      p1 &&
                      (p1.registration_id === myRegistrationId || p1.registration?.id === myRegistrationId)
                    );
                    const isMeP2 = Boolean(
                      myRegistrationId &&
                      p2 &&
                      (p2.registration_id === myRegistrationId || p2.registration?.id === myRegistrationId)
                    );

                    const cardBorderColor = isLive ? '#ea580c' : (isDark ? '#334155' : '#e2e8f0');
                    const cardBgColor = isDark ? '#1e293b' : '#ffffff';

                    return (
                      <G 
                        key={match.id} 
                        transform={`translate(${coord.x}, ${coord.y})`}
                        onPress={() => handleMatchClick(match)}
                      >
                        <Rect
                          x="0"
                          y="0"
                          width={nodeWidth}
                          height={nodeHeight}
                          rx="6"
                          ry="6"
                          fill={cardBgColor}
                          stroke={cardBorderColor}
                          strokeWidth={isLive ? '1.8' : '1'}
                        />

                        <Rect
                          x="1"
                          y="1"
                          width={nodeWidth - 2}
                          height={headerHeight}
                          rx="4"
                          ry="4"
                          fill={isDark ? '#0f172a' : '#f8fafc'}
                        />
                        <SvgText
                          x="6"
                          y={headerHeight - 4}
                          fontSize="8.5"
                          fontWeight="bold"
                          fill={isDark ? '#94a3b8' : '#64748b'}
                        >
                          {match.name || `Trận ${match.match_no}`}
                        </SvgText>

                        <Path d={`M 1 ${separator1Y} H ${nodeWidth - 1}`} stroke={isDark ? '#1e293b' : '#f1f5f9'} strokeWidth="1" />

                        <Rect
                          x="2"
                          y={p1Y}
                          width={nodeWidth - 4}
                          height={rowHeight - 1}
                          fill={p1?.is_winner ? (isDark ? 'rgba(4, 120, 87, 0.2)' : '#ecfdf5') : 'transparent'}
                          rx="3"
                          ry="3"
                        />
                        <SvgText
                          x="6"
                          y={p1Y + rowHeight - 4}
                          fontSize={String(getParticipantFontSize(p1))}
                          fontWeight={getParticipantFontWeight(p1)}
                          fill={getParticipantColor(p1)}
                        >
                          {getParticipantName(p1)}
                        </SvgText>
                        {p1?.is_winner && (
                          <SvgText x={nodeWidth - 14} y={p1Y + rowHeight - 4} fontSize="8">🏆</SvgText>
                        )}
                        {isMeP1 && (
                          <G>
                            <Rect
                              x={nodeWidth - (p1?.is_winner ? 34 : 22)}
                              y={p1Y + rowHeight - 11}
                              width="18"
                              height="8.5"
                              rx="2"
                              ry="2"
                              fill="#fff7ed"
                              stroke="#ea580c"
                              strokeWidth="0.5"
                            />
                            <SvgText
                              x={nodeWidth - (p1?.is_winner ? 31 : 19)}
                              y={p1Y + rowHeight - 4}
                              fontSize="6"
                              fontWeight="bold"
                              fill="#ea580c"
                            >
                              Bạn
                            </SvgText>
                          </G>
                        )}

                        <Path d={`M 4 ${separator2Y} H ${nodeWidth - 4}`} stroke={isDark ? '#0f172a' : '#f1f5f9'} strokeWidth="1" />

                        <Rect
                          x="2"
                          y={p2Y}
                          width={nodeWidth - 4}
                          height={rowHeight - 1}
                          fill={p2?.is_winner ? (isDark ? 'rgba(4, 120, 87, 0.2)' : '#ecfdf5') : 'transparent'}
                          rx="3"
                          ry="3"
                        />
                        <SvgText
                          x="6"
                          y={p2Y + rowHeight - 4}
                          fontSize={String(getParticipantFontSize(p2))}
                          fontWeight={getParticipantFontWeight(p2)}
                          fill={getParticipantColor(p2)}
                        >
                          {isBye && !p2 ? 'Không có đối thủ' : getParticipantName(p2)}
                        </SvgText>
                        {p2?.is_winner && (
                          <SvgText x={nodeWidth - 14} y={p2Y + rowHeight - 4} fontSize="8">🏆</SvgText>
                        )}
                        {isMeP2 && (
                          <G>
                            <Rect
                              x={nodeWidth - (p2?.is_winner ? 34 : 22)}
                              y={p2Y + rowHeight - 11}
                              width="18"
                              height="8.5"
                              rx="2"
                              ry="2"
                              fill="#fff7ed"
                              stroke="#ea580c"
                              strokeWidth="0.5"
                            />
                            <SvgText
                              x={nodeWidth - (p2?.is_winner ? 31 : 19)}
                              y={p2Y + rowHeight - 4}
                              fontSize="6"
                              fontWeight="bold"
                              fill="#ea580c"
                            >
                              Bạn
                            </SvgText>
                          </G>
                        )}
                      </G>
                    );
                  })}
              </G>
            </Svg>
          </View>
        )
      )}

      {/* Modal chi tiết trận đấu khi nhấn vào 1 ô */}
      <Modal
        visible={detailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalOpen(false)}
      >
        <Pressable 
          className="flex-1 bg-black/60 justify-center items-center p-6"
          onPress={() => setDetailModalOpen(false)}
        >
          <Pressable 
            className="w-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-gray-100 dark:border-slate-800 shadow-2xl"
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View className="flex-row justify-between items-center border-b border-gray-100 dark:border-slate-800/80 pb-3 mb-4">
              <View>
                <Text className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">
                  Trận đối kháng
                </Text>
                <Text className="text-sm font-extrabold text-slate-850 dark:text-white mt-0.5">
                  {selectedMatch?.name || `Trận đấu #${selectedMatch?.match_no}`}
                </Text>
              </View>
              <Pressable 
                onPress={() => setDetailModalOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-50 dark:bg-slate-900 items-center justify-center active:bg-slate-100"
              >
                <Text className="text-slate-400 dark:text-slate-500 font-extrabold text-base">×</Text>
              </Pressable>
            </View>

            {/* Trạng thái trận đấu */}
            <View className="mb-4 flex-row items-center gap-2 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100/80 dark:border-slate-850/60">
              <View className={`h-2 w-2 rounded-full ${
                selectedMatch?.status === 'COMPLETED' ? 'bg-gray-400' :
                selectedMatch?.status === 'RUNNING' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`} />
              <Text className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                Trạng thái: {
                  selectedMatch?.status === 'COMPLETED' ? 'Đã kết thúc' :
                  selectedMatch?.status === 'RUNNING' ? 'Đang thi đấu' : 'Chờ thi đấu'
                }
              </Text>
            </View>

            {/* Đấu thủ 1 */}
            {(() => {
              const p1 = selectedMatch?.participants.find((p) => p.slot_no === 1);
              const p1Name = p1 ? (p1.registration?.participant_name || p1.registration?.driver_handle || 'Ẩn danh') : 'Chờ vòng trước';
              const p1Avatar = p1?.registration?.participant_avatar_url || null;
              const isMeP1 = Boolean(
                myRegistrationId &&
                p1 &&
                (p1.registration_id === myRegistrationId || p1.registration?.id === myRegistrationId)
              );

              return (
                <View className={`flex-row items-center p-3 mb-3 rounded-2xl border ${
                  p1?.is_winner 
                    ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/80 dark:border-emerald-500/20' 
                    : 'bg-white dark:bg-slate-900/20 border-slate-100 dark:border-slate-850'
                }`}>
                  {/* Avatar */}
                  <View className="h-10 w-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-850 mr-3 border border-slate-200/80 dark:border-slate-700/60">
                    {p1Avatar ? (
                      <Image source={{ uri: p1Avatar }} className="h-full w-full" />
                    ) : (
                      <View className="h-full w-full bg-orange-100 dark:bg-orange-950/30 items-center justify-center">
                        <Text className="text-orange-600 dark:text-orange-400 font-extrabold text-sm">
                          {p1Name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Info */}
                  <View className="flex-1">
                    <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Tay đua 1</Text>
                    <Text className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5" numberOfLines={1}>
                      {p1Name}
                    </Text>
                    {p1?.registration?.driver_handle && p1?.registration?.participant_name ? (
                      <Text className="text-[9px] text-slate-450 dark:text-slate-500 mt-0.5">@{p1.registration.driver_handle}</Text>
                    ) : null}
                  </View>
                  {/* Winner badge */}
                  {p1?.is_winner && (
                    <View className="bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded-lg flex-row items-center gap-1">
                      <Text className="text-xs">🏆</Text>
                      <Text className="text-[9px] font-extrabold text-amber-700 dark:text-amber-400">THẮNG</Text>
                    </View>
                  )}
                  {/* Bạn badge */}
                  {isMeP1 && (
                    <View className="bg-orange-100 dark:bg-orange-500/20 px-2.5 py-1 rounded-lg flex-row items-center gap-1 ml-1.5 border border-orange-200/60 dark:border-orange-500/20">
                      <Text className="text-[9px] font-extrabold text-orange-700 dark:text-orange-400">BẠN</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Đấu thủ 2 */}
            {(() => {
              const p2 = selectedMatch?.participants.find((p) => p.slot_no === 2);
              const isBye = selectedMatch?.metadata?.bye;
              const p2Name = p2 ? (p2.registration?.participant_name || p2.registration?.driver_handle || 'Ẩn danh') : (isBye ? 'Không có đối thủ' : 'Chờ vòng trước');
              const p2Avatar = p2?.registration?.participant_avatar_url || null;
              const isMeP2 = Boolean(
                myRegistrationId &&
                p2 &&
                (p2.registration_id === myRegistrationId || p2.registration?.id === myRegistrationId)
              );

              return (
                <View className={`flex-row items-center p-3 rounded-2xl border ${
                  p2?.is_winner 
                    ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/80 dark:border-emerald-500/20' 
                    : 'bg-white dark:bg-slate-900/20 border-slate-100 dark:border-slate-850'
                }`}>
                  {/* Avatar */}
                  <View className="h-10 w-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-850 mr-3 border border-slate-200/80 dark:border-slate-700/60">
                    {p2Avatar ? (
                      <Image source={{ uri: p2Avatar }} className="h-full w-full" />
                    ) : (
                      <View className="h-full w-full bg-orange-100 dark:bg-orange-950/30 items-center justify-center">
                        <Text className="text-orange-600 dark:text-orange-400 font-extrabold text-sm">
                          {p2Name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Info */}
                  <View className="flex-1">
                    <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Tay đua 2</Text>
                    <Text className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5" numberOfLines={1}>
                      {p2Name}
                    </Text>
                    {p2?.registration?.driver_handle && p2?.registration?.participant_name ? (
                      <Text className="text-[9px] text-slate-450 dark:text-slate-500 mt-0.5">@{p2.registration.driver_handle}</Text>
                    ) : null}
                  </View>
                  {/* Winner badge */}
                  {p2?.is_winner && (
                    <View className="bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded-lg flex-row items-center gap-1">
                      <Text className="text-xs">🏆</Text>
                      <Text className="text-[9px] font-extrabold text-amber-700 dark:text-amber-400">THẮNG</Text>
                    </View>
                  )}
                  {/* Bạn badge */}
                  {isMeP2 && (
                    <View className="bg-orange-100 dark:bg-orange-500/20 px-2.5 py-1 rounded-lg flex-row items-center gap-1 ml-1.5 border border-orange-200/60 dark:border-orange-500/20">
                      <Text className="text-[9px] font-extrabold text-orange-700 dark:text-orange-400">BẠN</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Nút đóng */}
            <Pressable
              onPress={() => setDetailModalOpen(false)}
              className="mt-5 w-full bg-orange-600 py-3 rounded-xl items-center justify-center active:bg-orange-700"
            >
              <Text className="text-xs font-bold text-white">ĐÓNG</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.5)',
    paddingVertical: 12,
  },
  containerDark: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
});
