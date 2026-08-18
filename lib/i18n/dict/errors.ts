// Server-action error messages, grouped by domain. Actions call getT()
// (cookie locale) and return t("errors.…") in FormState.error.
export const errors = {
  en: {
    auth: {
      usernameFormat: "Username must be 3-20 characters: letters, numbers, underscore.",
      passwordTooShort: "Password must be at least 6 characters.",
      usernameTaken: "That username is taken.",
      badCredentials: "Wrong username or password.",
    },
    join: {
      emptyCode: "Enter a join code.",
      notFound: "No campaign found for that code.",
    },
    codex: {
      notMember: "You are not a member of this world.",
      dmOnlyEntries: "Only the DM can add codex entries.",
      badType: "Pick a valid entry type.",
      titleRequired: "A title is required.",
      dmOnlyCreate: "Only DMs can create DM-only entries.",
      entryNotFound: "Entry not found.",
      cannotEdit: "You cannot edit this entry.",
    },
    maps: {
      dmOnly: "Only the DM can upload maps.",
      noFile: "Pick an image file.",
      tooLarge: "Image is larger than 10 MB.",
      badType: "Use a PNG, JPG, or WebP image.",
    },
    session: {
      dmOnlyAdd: "Only the DM can add combatants.",
      nameRequired: "Name is required.",
      initiativeRequired: "Initiative is required.",
    },
  },
  tr: {
    auth: {
      usernameFormat: "Kullanıcı adı 3-20 karakter olmalı: harf, rakam, alt çizgi.",
      passwordTooShort: "Şifre en az 6 karakter olmalı.",
      usernameTaken: "Bu kullanıcı adı alınmış.",
      badCredentials: "Kullanıcı adı veya şifre hatalı.",
    },
    join: {
      emptyCode: "Katılım kodu gir.",
      notFound: "Bu koda ait kampanya bulunamadı.",
    },
    codex: {
      notMember: "Bu dünyanın üyesi değilsin.",
      dmOnlyEntries: "Kodekse kayıt eklemek yalnız DM'in elinde.",
      badType: "Geçerli bir kayıt türü seç.",
      titleRequired: "Başlık zorunlu.",
      dmOnlyCreate: "DM'e özel kayıtları yalnız DM'ler oluşturabilir.",
      entryNotFound: "Kayıt bulunamadı.",
      cannotEdit: "Bu kaydı düzenleyemezsin.",
    },
    maps: {
      dmOnly: "Haritaları yalnız DM yükleyebilir.",
      noFile: "Bir görsel dosyası seç.",
      tooLarge: "Görsel 10 MB'den büyük.",
      badType: "PNG, JPG veya WebP kullan.",
    },
    session: {
      dmOnlyAdd: "Dövüşçüleri yalnız DM ekleyebilir.",
      nameRequired: "İsim zorunlu.",
      initiativeRequired: "İnisiyatif zorunlu.",
    },
  },
} as const;
