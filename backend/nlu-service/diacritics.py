# Vietnamese syllable → most common diacritic form
# Focused on RC cafe booking domain + common conversational Vietnamese
DIACRITICS_MAP: dict[str, str] = {
    # Greetings / hỏi thăm
    "chao": "chào",
    "xin": "xin",
    "hello": "hello",
    "ban": "bạn",
    "oi": "ơi",
    "a": "ạ",
    "nhe": "nhé",

    # Đặt lịch / booking
    "dat": "đặt",
    "lich": "lịch",
    "cho": "chỗ",
    "slot": "slot",
    "chon": "chọn",
    "book": "book",
    "muon": "muốn",
    "duoc": "được",
    "co": "có",
    "the": "thể",
    "khong": "không",
    "con": "còn",
    "trong": "trống",
    "het": "hết",
    "day": "đầy",

    # Thời gian
    "hom": "hôm",
    "nay": "nay",
    "mai": "mai",
    "ngay": "ngày",
    "cuoi": "cuối",
    "tuan": "tuần",
    "thu": "thứ",
    "gio": "giờ",
    "buoi": "buổi",
    "sang": "sáng",
    "chieu": "chiều",
    "toi": "tối",
    "som": "sớm",
    "muon": "muộn",
    "truoc": "trước",
    "sau": "sau",

    # Hỏi giá / dịch vụ
    "gia": "giá",
    "bao": "bao",
    "nhieu": "nhiêu",
    "phi": "phí",
    "thue": "thuê",
    "biet": "biết",
    "thong": "thông",
    "tin": "tin",
    "dich": "dịch",
    "vu": "vụ",
    "bao": "bảo",
    "nao": "nào",

    # Xe RC
    "xe": "xe",
    "choi": "chơi",
    "san": "sân",
    "dua": "đua",
    "loai": "loại",
    "mau": "màu",
    "nhanh": "nhanh",
    "lon": "lớn",
    "nho": "nhỏ",

    # Common functional words
    "toi": "tôi",
    "minh": "mình",
    "ban": "bạn",
    "giup": "giúp",
    "ho": "hỗ",
    "tro": "trợ",
    "gui": "gửi",
    "hoi": "hỏi",
    "them": "thêm",
    "luc": "lúc",
    "khi": "khi",
    "neu": "nếu",
    "va": "và",
    "hay": "hay",
    "hoac": "hoặc",
    "voi": "với",
    "de": "để",
    "lam": "làm",
    "xem": "xem",
    "kiem": "kiểm",
    "tra": "tra",
}


def restore(text: str) -> str:
    """Best-effort syllable-level diacritics restoration."""
    words = text.lower().split()
    return " ".join(DIACRITICS_MAP.get(w, w) for w in words)


def is_non_diacritical(text: str) -> bool:
    """True nếu text có ký tự Latin nhưng không có dấu tiếng Việt."""
    import re
    has_latin = bool(re.search(r"[a-zA-Z]", text))
    has_diacritic = bool(re.search(
        r"[àáảãạăắằẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]",
        text, re.IGNORECASE
    ))
    return has_latin and not has_diacritic
