# Failure: Unsafe File Move

症状：文件整理 Route 直接使用 shell move/rename，或把 Context 机械映射为文件夹树。

修正：inventory → plan → preview → Core apply；Core capability 缺失时 plan-only。

验证：无 shell move；高风险/歧义项被阻止；纯路径变化不制造新 Revision。
