# 🔬 Инструкция для физика (Ashkan Ashkani)
**Проект:** Flame in Freefall: AI-Powered Microgravity Fire Safety (NASA Space Apps Challenge)  
**Коллаборация:** Ашкан (Физика) + Лала (3D/Дизайн) + Карен (Бэкенд/Тимлид)  
**Ветка:** `dev-ashkan`

---

## 🎯 Твоя главная цель на ближайшие 2 часа:
Валидация физической модели горения, проверка констант и совместная работа с 3D-дизайнером над правдоподобием визуализации.

---

## 📚 Где находятся основные материалы:
1. Полный учебник: [Resources/Law_Combustion_Physics.pdf](file:///c:/NasaSpaceAPPFlameInFreefall/Resources/Law_Combustion_Physics.pdf)
2. Готовый конспект формул и констант: [Resources/physics_formulas_summary.md](file:///c:/NasaSpaceAPPFlameInFreefall/Resources/physics_formulas_summary.md)
3. Код математической модели: [physics_engine/combustion_model.py](file:///c:/NasaSpaceAPPFlameInFreefall/physics_engine/combustion_model.py)

---

## 📝 Чеклист проверки для Ашкана:
- [ ] **Закон $d^2$:** Убедись, что $K_{0g} \approx 0.5\text{ mm}^2/\text{s}$ для $n$-гептана в 0g соответствует данным CIR/MDCA (на Земле $K_{1g} \approx 0.85-0.95\text{ mm}^2/\text{s}$ из-за естественной конвекции).
- [ ] **Standoff Ratio:** Проверь отношение радиуса пламени к радиусу капли:
  $$\frac{r_f}{r_s} = \frac{\ln(1 + B)}{\ln(1 + Y_{O_2}/s)}$$
  В 0g оно должно быть порядка $8-12$ (в земном пламени сжато до $2-4$).
- [ ] **Холодное пламя (Cool Flames, PSI-117):**
  - Температура: $\approx 650 - 800\text{ K}$.
  - Скорость выгорания: $K_{\text{cool}} \approx 0.15 - 0.22\text{ mm}^2/\text{s}$.
  - Оптический спектр: слабое ультрафиолетовое / формальдегидное излучение, видимый свет почти отсутствует.
- [ ] **Критерий негорючести Лоу (Section 0.1):** Порог $X_{O_2} < 15\%$ по объему гарантирует затухание пламени при аварийном обеднении отсека.
- [ ] **Оценка 3D-модели дизайнера:** Открой `frontend/index.html` и дай обратную связь дизайнеру:
  - "Достаточно ли сферично пламя?"
  - "Правильно ли расположены цветовые зоны свечения сажи и хемолюминесценции?"
