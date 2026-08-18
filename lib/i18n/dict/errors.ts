// Server-action error messages, grouped by domain. Actions call getT()
// (cookie locale) and return t("errors.…") in FormState.error.
export const errors = {
  en: {
    auth: {
      usernameFormat: "Username must be 3-20 characters: letters, numbers, underscore.",
      passwordTooShort: "Password must be at least 6 characters.",
      passwordTooLong: "Password must be at most 128 characters.",
      usernameTaken: "That username is taken.",
      badCredentials: "Wrong username or password.",
      emailInvalid: "Enter a valid email address.",
      emailTaken: "That email address is already on another account.",
      emailMissing: "There is no address on this account yet.",
      resetLinkInvalid: "This reset link has expired or has already been used.",
      // Deliberately says nothing about which limit was hit or when it lifts.
      tooManyAttempts: "Too many attempts. Please try again later.",
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
      // The map goes to storage from the browser, so this covers every step
      // of that trip that can fail without the app learning anything useful.
      uploadFailed: "Upload failed. Please try again.",
    },
    portrait: {
      notAllowed: "You cannot edit this character sheet.",
      noFile: "Pick an image file.",
      tooLarge: "Image is larger than 4 MB.",
      badType: "Use a PNG, JPG, or WebP image.",
    },
    worldItems: {
      dmOnly: "Only the DM can forge items for this world.",
      notAllowed: "You cannot edit this item.",
      nameRequired: "A name is required.",
      duplicateName: "This world already has an item by that name.",
      tooLarge: "Image is larger than 4 MB.",
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
      passwordTooLong: "Parola en fazla 128 karakter olabilir.",
      usernameTaken: "Bu kullanıcı adı alınmış.",
      badCredentials: "Kullanıcı adı veya şifre hatalı.",
      emailInvalid: "Geçerli bir e-posta adresi gir.",
      emailTaken: "Bu e-posta adresi başka bir hesapta kayıtlı.",
      emailMissing: "Bu hesapta henüz bir adres yok.",
      resetLinkInvalid: "Bu sıfırlama bağlantısının süresi dolmuş ya da daha önce kullanılmış.",
      tooManyAttempts: "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
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
      uploadFailed: "Yükleme başarısız oldu. Tekrar dene.",
    },
    portrait: {
      notAllowed: "Bu karakter sayfasını düzenleyemezsin.",
      noFile: "Bir görsel dosyası seç.",
      tooLarge: "Görsel 4 MB'den büyük.",
      badType: "PNG, JPG veya WebP kullan.",
    },
    worldItems: {
      dmOnly: "Bu dünyaya eşya dövmek yalnız DM'in elinde.",
      notAllowed: "Bu eşyayı düzenleyemezsin.",
      nameRequired: "Ad zorunlu.",
      duplicateName: "Bu dünyada aynı adlı bir eşya zaten var.",
      tooLarge: "Görsel 4 MB'den büyük.",
      badType: "PNG, JPG veya WebP kullan.",
    },
    session: {
      dmOnlyAdd: "Dövüşçüleri yalnız DM ekleyebilir.",
      nameRequired: "İsim zorunlu.",
      initiativeRequired: "İnisiyatif zorunlu.",
    },
  },
} as const;
