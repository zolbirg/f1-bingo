/**
 * НАСТРОЙКА FIREBASE
 * ─────────────────────────────────────────────────────────────────────
 * 1. Зайди на https://console.firebase.google.com/
 * 2. Создай проект (или открой существующий)
 * 3. Добавь Web-приложение (кнопка </>)
 * 4. Скопируй объект firebaseConfig и вставь ниже вместо placeholder-значений
 * 5. В консоли Firebase: Authentication → Sign-in method → включи:
 *    • Google
 *    • Email/Password
 * 6. В консоли Firebase: Authentication → Settings → Authorised domains →
 *    добавь домен своего сайта (для локального тестирования уже есть localhost)
 * ─────────────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey:            "AIzaSyCUN-5uGCA7bYNmTF6GIaoSpb8xKzh6YNs",
  authDomain:        "f1-bingo-c2271.firebaseapp.com",
  projectId:         "f1-bingo-c2271",
  storageBucket:     "f1-bingo-c2271.firebasestorage.app",
  messagingSenderId: "503620814844",
  appId:             "1:503620814844:web:8eafd7f697a28e3f6ed479",
  measurementId:     "G-7MTNJJC0CL"
};
