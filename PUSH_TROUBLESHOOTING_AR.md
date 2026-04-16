# حل مشكلة `git push` (403) بسبب صلاحيات الـ proxy المحلي

لو الـ push بيفشل بـ 403، غالبًا السبب صلاحيات/توكن وليس الكود.

## 1) تأكد من الـ remote الحالي
```bash
git remote -v
```

## 2) جرّب HTTPS مع Personal Access Token
- أنشئ PAT فيه صلاحية `repo`.
- استخدمه بدل الباسورد عند `git push`.

```bash
git push -u origin claude/github-website-integration-EFzPv
```

## 3) لو عندك GitHub CLI
```bash
gh auth status
gh auth login
git push -u origin claude/github-website-integration-EFzPv
```

## 4) لو المشكلة من proxy داخلي
- راجع متغيرات البيئة:
```bash
env | grep -i proxy
```
- مؤقتًا (للجلسة الحالية) جرّب تعطيلها:
```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
```
ثم أعد المحاولة.

## 5) بديل سريع
لو حد عنده صلاحية push على نفس الريبو، يقدر يدفع نفس الفرع محليًا بالأمر:
```bash
git push -u origin claude/github-website-integration-EFzPv
```

---

> ملاحظة: الـ commits المحلية سليمة. المشكلة تشغيلية في الصلاحيات/المسار الشبكي.
