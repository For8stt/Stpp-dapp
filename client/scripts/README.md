# Storage Clearing Scripts

## Автоматичне очищення

При запуску додатку (`npm start`) на localhost автоматично очищається sessionStorage, пов'язаний з TimeService. Це забезпечує свіжий старт при перезапуску програми.

## Ручне очищення

Якщо потрібно вручну очистити storage:

### Варіант 1: Використовувати HTML файл

Відкрийте `scripts/clear-storage.html` у браузері та натисніть кнопку "Clear Time Service Storage".

### Варіант 2: Використовувати консоль браузера

Відкрийте консоль браузера (F12) та виконайте:

```javascript
// Очистити тільки TimeService storage
const keys = [
  'timeService:lastTime',
  'timeService:lastTimeTimestamp',
  'timeService:blockchainOffset',
  'timeService:lastSyncTime',
  'timeService:lastBlockchainTime'
];
keys.forEach(key => {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
});
console.log('✅ Storage cleared');

// Або очистити весь storage
sessionStorage.clear();
localStorage.clear();
console.log('✅ All storage cleared');
```

### Варіант 3: Через DevTools

1. Відкрийте DevTools (F12)
2. Перейдіть на вкладку "Application" (Chrome) або "Storage" (Firefox)
3. Знайдіть "Session Storage" або "Local Storage"
4. Видаліть потрібні ключі або очистіть весь storage

## Що очищається

- `timeService:lastTime` - останній збережений час
- `timeService:lastTimeTimestamp` - timestamp збереження
- `timeService:blockchainOffset` - зміщення часу блокчейну
- `timeService:lastSyncTime` - час останньої синхронізації
- `timeService:lastBlockchainTime` - останній час блокчейну

Це запобігає проблемам з прискореним часом при перезапуску програми.

