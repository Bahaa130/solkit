// src/shims/buffer.ts
// 🛡️ بديل المتصفح لحزمة `buffer` — يحل خطأ "Buffer is not defined"
// مكتبات سولانا (spl-token, spl-token-metadata, web3) تستورد Buffer كتصدير مُسمّى:
//   import { Buffer } from "buffer"
// حزمة buffer الأصلية CommonJS تصدّر { Buffer, SlowBuffer } — لذا نأخذ الدالة Buffer
// نفسها (وليس غلاف الكائن) من خلال BufferModule.Buffer، وهذا يصلح في كل مسارات
// التجاوز (مصدر مباشر أو pre-bundle عبر Rolldown).
// @ts-ignore — لا توجد أنواع TypeScript في المسار النسبي لحزمة buffer
import BufferModule from "../../node_modules/buffer/index.js";

// في بعض مسارات التجاوز يكون الاستيراد الافتراضي هو الكائن المُصدَّر { Buffer, SlowBuffer }
// وفي أخرى يكون الدالة Buffer نفسها — المعادلة التالية تغطي الحالتين.
const BufferImpl: any = (BufferModule && BufferModule.Buffer) || BufferModule;

export const Buffer = BufferImpl;
export const SlowBuffer = BufferImpl.SlowBuffer;
export default BufferImpl;
