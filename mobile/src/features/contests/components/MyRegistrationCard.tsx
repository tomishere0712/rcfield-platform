import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, Modal } from 'react-native';
import { Calendar, QrCode, CreditCard, Trash2, Edit } from 'lucide-react-native';
import type { ContestRegistration } from '../types/contests.types';

interface MyRegistrationCardProps {
  registration: ContestRegistration;
  onPayPress: (registrationId: string) => void;
  onCancelPress: (registrationId: string) => void;
  onEditByocPress: (registration: ContestRegistration) => void;
  onPressCard: (contestId: string) => void;
}

export const MyRegistrationCard: React.FC<MyRegistrationCardProps> = ({
  registration,
  onPayPress,
  onCancelPress,
  onEditByocPress,
  onPressCard,
}) => {
  const [isQrZoomed, setIsQrZoomed] = useState(false);
  const contest = registration.contest;
  if (!contest) return null;

  const now = Date.now();
  const isPaid =
    registration.payment_status === 'MARKED_PAID' ||
    (registration.payment_status as string) === 'PAID';
  const holdExpiresAt = registration.entry_fee_hold_expires_at
    ? new Date(registration.entry_fee_hold_expires_at).getTime()
    : null;
  const isHoldExpired = holdExpiresAt ? holdExpiresAt <= now : false;
  const contestStarted = contest.starts_at ? new Date(contest.starts_at).getTime() < now : false;

  const isEffectiveCancelled =
    !isPaid &&
    (registration.status === 'CANCELLED' ||
      (registration.payment_status === 'PENDING_PAYMENT' && isHoldExpired));

  const getUnifiedBadge = () => {
    if (isEffectiveCancelled) {
      return { label: 'Đã hủy', style: 'bg-red-50 text-red-600 border border-red-100' };
    }
    if ((registration.status === 'CONFIRMED' || isPaid) && contestStarted && !registration.checked_in_at) {
      return { label: 'Không đến', style: 'bg-orange-50 text-orange-700 border border-orange-200' };
    }
    if (registration.payment_status === 'PENDING_PAYMENT' && !isHoldExpired && registration.status !== 'CANCELLED') {
      return { label: 'Chờ thanh toán lệ phí', style: 'bg-amber-50 text-amber-700 border border-amber-200' };
    }
    const journeyStatus = registration.customer_journey_status;
    if (journeyStatus === 'ADVANCED') return { label: 'Đã vào vòng tiếp', style: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
    if (journeyStatus === 'IN_BRACKET') return { label: 'Đang trong nhánh đấu', style: 'bg-purple-50 text-purple-700 border border-purple-200' };
    if (journeyStatus === 'ELIMINATED') return { label: 'Đã bị loại', style: 'bg-slate-100 text-slate-600 border border-slate-200' };
    if (journeyStatus === 'FINISHED') return { label: 'Hoàn thành', style: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    if (journeyStatus === 'READY_TO_RACE') return { label: 'Sẵn sàng đua', style: 'bg-teal-50 text-teal-700 border border-teal-200' };
    if (journeyStatus === 'APPROVED_WAITING_CHECKIN') return { label: 'Chờ check-in', style: 'bg-blue-50 text-blue-700 border border-blue-200' };
    if (registration.status === 'CONFIRMED' || isPaid) return { label: 'Đã xác nhận', style: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    return { label: 'Chờ duyệt', style: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };
  };

  const badge = getUnifiedBadge();

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'PENDING_PAYMENT':
        return 'Chờ thanh toán';
      case 'PENDING_REVIEW':
        return 'Chờ duyệt phí';
      case 'MARKED_PAID':
        return 'Đã thanh toán';
      case 'WAIVED':
        return 'Miễn phí (Ưu đãi)';
      case 'NOT_REQUIRED':
        return 'Không yêu cầu phí';
      default:
        return status;
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'MARKED_PAID':
      case 'WAIVED':
      case 'NOT_REQUIRED':
        return 'text-emerald-700 font-bold';
      case 'PENDING_PAYMENT':
        return 'text-red-500 font-bold';
      case 'PENDING_REVIEW':
        return 'text-amber-600 font-bold';
      default:
        return 'text-gray-500';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Chưa định ngày';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${registration.check_in_code}`;
  const defaultBanner = 'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=600&q=80';

  const showCancelConfirm = () => {
    Alert.alert(
      'Hủy đăng ký giải đấu',
      'Bạn có chắc chắn muốn hủy đăng ký tham gia giải đấu này không? Lệ phí hoàn trả (nếu có) sẽ được xử lý thủ công theo chính sách.',
      [
        { text: 'Quay lại', style: 'cancel' },
        { text: 'Đồng ý hủy', style: 'destructive', onPress: () => onCancelPress(registration.id) },
      ]
    );
  };

  const canCancel = registration.status === 'PENDING' && registration.payment_status === 'PENDING_PAYMENT' && !isHoldExpired;
  const canEditByoc = registration.vehicle_source === 'BYOC' && registration.status === 'PENDING' && !isEffectiveCancelled;
  const showPayButton = registration.payment_status === 'PENDING_PAYMENT' && !isHoldExpired && registration.status !== 'CANCELLED';

  const showQr = !isEffectiveCancelled && (registration.status === 'CONFIRMED' || isPaid) && Boolean(registration.check_in_code);

  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      {/* Header Info */}
      <TouchableOpacity 
        activeOpacity={0.7} 
        onPress={() => onPressCard(contest.id)}
        className="flex-row items-center border-b border-gray-50 dark:border-slate-800/60 pb-3"
      >
        <Image
          source={contest.banner_image_url ? { uri: contest.banner_image_url } : { uri: defaultBanner }}
          className="h-16 w-16 rounded-xl object-cover"
          resizeMode="cover"
        />
        <View className="ml-3 flex-1">
          <Text className="text-sm font-extrabold text-gray-900 dark:text-white leading-tight mb-1" numberOfLines={2}>
            {contest.name}
          </Text>
          <View className="flex-row items-center">
            <Calendar color="#94a3b8" size={12} style={{ marginRight: 4 }} />
            <Text className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
              {formatDate(contest.starts_at)}
            </Text>
          </View>
        </View>
        
        {/* Unified Status Badge */}
        <View className="ml-2">
          <View className={`rounded-full px-2 py-0.5 ${badge.style}`}>
            <Text className="text-[10px] font-extrabold uppercase">
              {badge.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Alert Boxes */}
      {/* 1. Suất được giữ đến (Còn hạn) */}
      {registration.payment_status === 'PENDING_PAYMENT' &&
      registration.entry_fee_hold_expires_at &&
      !isHoldExpired &&
      !isEffectiveCancelled ? (
        <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Text className="text-xs font-bold text-amber-900">
            Suất được giữ đến{' '}
            {new Date(registration.entry_fee_hold_expires_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text className="mt-1 text-[11px] font-medium text-amber-800">
            Chưa thanh toán lệ phí trước giờ đó thì suất sẽ trả lại cho người khác.
          </Text>
        </View>
      ) : null}

      {/* 2. Đã hết thời gian thanh toán lại (Hết hạn giữ chỗ) */}
      {!isPaid && registration.entry_fee_hold_expires_at && isHoldExpired ? (
        <View className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <Text className="text-xs font-bold text-red-900">
            Đã hết thời gian giữ chỗ thanh toán lệ phí (hết hạn lúc{' '}
            {new Date(registration.entry_fee_hold_expires_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            )
          </Text>
          <Text className="mt-1 text-[11px] font-medium text-red-800">
            Đơn đã chuyển sang trạng thái đã hủy do quá thời gian thanh toán lại.
          </Text>
        </View>
      ) : null}

      {/* 3. Lý do hủy khác */}
      {!isPaid &&
      registration.status === 'CANCELLED' &&
      registration.cancellation_reason &&
      !isHoldExpired ? (
        <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Text className="text-xs font-bold text-amber-900">
            Lý do hủy: {registration.cancellation_reason}
          </Text>
          <Text className="mt-1 text-[11px] font-medium text-amber-800">
            Suất đã được trả lại. Giải còn mở đăng ký thì bạn vẫn đăng ký lại được từ đầu.
          </Text>
        </View>
      ) : null}

      {/* Detail Grid */}
      <View className="my-3 space-y-2">
        <View className="flex-row justify-between items-center">
          <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">Hình thức xe:</Text>
          <Text className="text-xs font-bold text-gray-800 dark:text-slate-200">
            {registration.vehicle_source === 'RENTAL' ? 'Thuê xe của cơ sở' : 'Xe cá nhân tự mang (BYOC)'}
          </Text>
        </View>

        {registration.vehicle_source === 'BYOC' && registration.metadata?.byoc_declaration && (
          <View className="flex-row justify-between items-center">
            <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">Xe đăng ký:</Text>
            <Text className="text-xs font-bold text-gray-800 dark:text-slate-200" numberOfLines={1}>
              {registration.metadata.byoc_declaration.vehicle_brand} - {registration.metadata.byoc_declaration.vehicle_name}
            </Text>
          </View>
        )}

        <View className="flex-row justify-between items-center">
          <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">Lệ phí giải:</Text>
          <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200">
            {contest.entry_fee === 0 ? 'Miễn phí' : `${contest.entry_fee.toLocaleString('vi-VN')} VND`}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">Trạng thái phí:</Text>
          <Text className={`text-xs ${getPaymentStatusColor(registration.payment_status)}`}>
            {getPaymentStatusText(registration.payment_status)}
          </Text>
        </View>
      </View>

      {/* QR Code and checkInCode (Only when confirmed or checked in and not cancelled) */}
      {showQr && (
        <View className="my-2 items-center justify-center rounded-xl bg-gray-50 dark:bg-slate-900/30 p-4 border border-gray-100/60 dark:border-slate-800/80">
          <TouchableOpacity activeOpacity={0.8} onPress={() => setIsQrZoomed(true)}>
            <Image
              source={{ uri: qrCodeUrl }}
              className="h-32 w-32 mb-2 bg-white p-1 rounded-lg"
            />
          </TouchableOpacity>
          <View className="flex-row items-center">
            <QrCode size={14} color="#94a3b8" style={{ marginRight: 4 }} />
            <Text className="text-xs font-extrabold tracking-wider text-gray-700 dark:text-slate-350">
              Mã Check-in: {registration.check_in_code}
            </Text>
          </View>
          <Text className="text-[10px] font-medium text-gray-400 dark:text-slate-500 mt-1">
            Nhấn vào mã QR để phóng to
          </Text>
        </View>
      )}

      {/* Modal Zoom QR */}
      <Modal visible={isQrZoomed} transparent animationType="fade" onRequestClose={() => setIsQrZoomed(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsQrZoomed(false)}
          className="flex-1 bg-black/85 justify-center items-center p-6"
        >
          <TouchableOpacity
            activeOpacity={1}
            className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 items-center shadow-xl border border-gray-100 dark:border-slate-800/85 w-[85%] max-w-[340px]"
          >
            {/* Header / Title */}
            <Text className="text-sm font-extrabold text-gray-900 dark:text-white mb-4 text-center">
              Mã QR Check-in
            </Text>
            
            {/* Large QR Image */}
            <Image
              source={{ uri: qrCodeUrl }}
              className="h-64 w-64 bg-white p-2 rounded-2xl mb-4"
              resizeMode="contain"
            />
            
            {/* Check-in Code */}
            <Text className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-500 mb-2 uppercase text-center">
              {registration.check_in_code}
            </Text>
            
            {/* Help text */}
            <Text className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 text-center mb-5 leading-normal">
              Đưa mã QR này cho nhân viên quầy quét để thực hiện điểm danh và nhận xe
            </Text>
            
            {/* Close Button */}
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => setIsQrZoomed(false)}
              className="w-full bg-gray-100 dark:bg-slate-800 py-3 rounded-xl items-center"
            >
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-200">
                Đóng
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Action Buttons */}
      {(canEditByoc || showPayButton || canCancel) && (
        <View className="flex-row gap-2 mt-2 items-center">
          {/* Nút sửa xe BYOC */}
          {canEditByoc && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onEditByocPress(registration)}
              className="flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 bg-white dark:bg-slate-900/40"
            >
              <Edit size={14} color="#4b5563" style={{ marginRight: 6 }} />
              <Text className="text-xs font-bold text-gray-700 dark:text-slate-350">Sửa xe BYOC</Text>
            </TouchableOpacity>
          )}

          {/* Nút thanh toán */}
          {showPayButton && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onPayPress(registration.id)}
              className="flex-1 flex-row items-center justify-center rounded-xl bg-emerald-600 py-2.5"
            >
              <CreditCard size={14} color="#ffffff" style={{ marginRight: 6 }} />
              <Text className="text-xs font-extrabold text-white">Thanh toán VNPay</Text>
            </TouchableOpacity>
          )}

          {/* Spacer để đẩy nút Hủy sang phải khi không có nút nào khác */}
          {canCancel && !canEditByoc && !showPayButton && (
            <View className="flex-1" />
          )}

          {/* Nút hủy - luôn nằm bên phải */}
          {canCancel && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={showCancelConfirm}
              className="flex-row items-center justify-center rounded-xl bg-red-600 px-4 py-2.5"
            >
              <Trash2 size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text className="text-xs font-bold text-white">Hủy</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};
