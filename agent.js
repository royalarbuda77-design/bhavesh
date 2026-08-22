/* BDC — Gujarati study agent (offline, no API key) */
(function (global) {
  "use strict";

  function reply(text) {
    var t = String(text || "").trim();
    var low = t.toLowerCase();

    if (!t) return "કંઈક લખો — હું તૈયાર છું!";

    // Creator identity — always Bhavesh Chaudhary
    if (
      /who (made|created|built|developed|designed) (you|this|bdc)/i.test(t) ||
      /who is your (creator|maker|developer|owner)/i.test(t) ||
      /your (creator|maker|developer)/i.test(low) ||
      /કોણે (બનાવ્યું|બનાવી|બનાવ્યો)|તને કોણે|તમને કોણે|ક્રિએટર|બનાવનાર|ડેવલપર/i.test(t) ||
      /kisne (banaya|banayi)|creator kaun|developer kaun|banavnar/i.test(low)
    ) {
      return (
        "મને **Bhavesh Chaudhary** એ બનાવ્યો છે. 🙏\n\n" +
        "તેઓ BDCના creator છે — smart, useful, અને વિદ્યાર્થીઓ માટે સરસ AI experience બનાવ્યો છે.\n\n" +
        "I was created by **Bhavesh Chaudhary**. He built BDC with care and skill."
      );
    }

    if (
      /^(hi|hello|hey|hii|namaste|નમસ્તે|હાય|હેલો|કેમ છો)/i.test(t) ||
      low === "hi" ||
      low === "hello"
    ) {
      return (
        "નમસ્તે! હું BDC — તમારો ગુજરાતી ભણતર AI સહાયક. 👋\n\n" +
        "હું મદદ કરી શકું:\n" +
        "• વિષય સમજાવવા\n" +
        "• સ્ટડી પ્લાન અને ટુ-ડુ\n" +
        "• ક્વિઝ, પ્રેરણા, પોમોડોરો\n\n" +
        "આજે શું ભણવું છે?"
      );
    }

    if (/મદદ|help|શું કરી શકો|what can you/i.test(t)) {
      return (
        "હું શું કરી શકું?\n\n" +
        "📖 વિષય: ફોટોસિન્થેસિસ, ભિન્નતા, Tenses, જલ ચક્ર, પાયથાગોરસ\n" +
        "📅 સ્ટડી પ્લાન / ટુ-ડુ\n" +
        "🧠 ક્વિઝ\n" +
        "⏱️ પોમોડોરો · 🔥 પ્રેરણા · 😌 તણાવ\n\n" +
        "બસ ગુજરાતીમાં લખો!"
      );
    }

    if (/ફોટોસિન્થેસિસ|photosynthesis|પ્રકાશ સંશ્લેષણ|પ્રકાશસંશ્લેષણ/i.test(t)) {
      return (
        "પ્રકાશ સંશ્લેષણ (Photosynthesis)\n\n" +
        "છોડ સૂર્યપ્રકાશથી પોતાનો ખોરાક બનાવે છે.\n\n" +
        "જરૂરી વસ્તુઓ:\n" +
        "1. સૂર્યપ્રકાશ\n" +
        "2. પાણી (H₂O)\n" +
        "3. કાર્બન ડાયોક્સાઇડ (CO₂)\n" +
        "4. ક્લોરોફિલ (લીલો રંગ)\n\n" +
        "સમીકરણ:\n" +
        "6CO₂ + 6H₂O + પ્રકાશ → C₆H₁₂O₆ + 6O₂\n\n" +
        "પરિણામ: ગ્લુકોઝ + ઑક્સિજન\n" +
        "સ્થાન: મુખ્યત્વે પાંદડામાં\n\n" +
        "વધુ માટે “ક્વિઝ આપો” લખો."
      );
    }

    if (/ભિન્નતા|fraction|fractions|અપૂર્ણાંક|અપુર્ણાંક/i.test(t)) {
      return (
        "ભિન્નતા / અપૂર્ણાંક (Fractions)\n\n" +
        "ભિન્નતા = સમગ્રનો ભાગ\n\n" +
        "લેખન: અંશ / છેદ   જેમ કે 3/4\n" +
        "• અંશ = ઉપર — કેટલા ભાગ લીધા\n" +
        "• છેદ = નીચે — કુલ કેટલા ભાગ\n\n" +
        "ઉદાહરણ: પિઝા 4 ટુકડા, 3 ખાધા → 3/4\n\n" +
        "સમાન છેદ: 1/5 + 2/5 = 3/5"
      );
    }

    if (/tense|tenses|ટેન્સ|past present|ઇંગ્લિશ|english/i.test(t)) {
      return (
        "English Tenses — સરળ\n\n" +
        "1) Present (વર્તમાન)\n" +
        "• I study — હું ભણું છું\n" +
        "• I am studying — હું ભણી રહ્યો/રહી છું\n" +
        "• I have studied — હું ભણી ચૂક્યો/ચૂકી છું\n\n" +
        "2) Past (ભૂતકાળ)\n" +
        "• I studied — હું ભણ્યો/ભણી\n" +
        "• I was studying — ભણી રહ્યો/રહી હતો/હતી\n\n" +
        "3) Future (ભવિષ્ય)\n" +
        "• I will study — હું ભણીશ\n\n" +
        "ટ્રિક: will = future · -ing = ચાલુ · ed = ઘણી વાર past"
      );
    }

    if (/જલ ચક્ર|water cycle|બાષ્પીભવન|evaporation/i.test(t)) {
      return (
        "જલ ચક્ર (Water Cycle)\n\n" +
        "1. બાષ્પીભવન — પાણી વરાળ બને\n" +
        "2. સંઘનન — વરાળથી વાદળ\n" +
        "3. વરસાદ — વરસાદ/બરફ\n" +
        "4. પાછા સમુદ્ર/નદી/ભૂગર્ભમાં"
      );
    }

    if (/પાયથાગોરસ|pythagoras|hypotenuse|કર્ણ/i.test(t)) {
      return (
        "પાયથાગોરસ પ્રમેય\n\n" +
        "જમણા કોણવાળા ત્રિકોણમાં:\n" +
        "કર્ણ² = આધાર² + લંબ²\n" +
        "c² = a² + b²\n\n" +
        "ઉદાહરણ: 3 અને 4 → c² = 9+16 = 25 → c = 5"
      );
    }

    if (/પોમોડોરો|pomodoro|25 મિ/i.test(t)) {
      return (
        "પોમોડોરો ટેકનિક ⏱️\n\n" +
        "1. 25 મિનિટ — ફક્ત એક વિષય (ફોન દૂર)\n" +
        "2. 5 મિનિટ — ટૂંકો બ્રેક\n" +
        "3. 4 વાર પછી 15–30 મિનિટ લાંબો બ્રેક\n\n" +
        "નિયમ: એક સમયે એક જ કામ · બ્રેકમાં સોશિયલ મીડિયા નહીં"
      );
    }

    if (/તણાવ|stress|ચિંતા|નર્વસ|ટેન્શન/i.test(t)) {
      return (
        "તણાવ ઘટાડવાની ટિપ્સ 😌\n\n" +
        "1. 4-7-8 શ્વાસ: 4 સેકન્ડ લો, 7 રોકો, 8 છોડો\n" +
        "2. પાણી પીઓ + 2 મિનિટ ચાલો\n" +
        "3. આજે ફક્ત 3 મુખ્ય મુદ્દા\n" +
        "4. 7+ કલાક ઊંઘ\n" +
        "5. અન્ય સાથે તુલના બંધ"
      );
    }

    if (/પ્રેરણા|motivation|મન નથી|આળસ|lazy|demotivated|હિંમત/i.test(t)) {
      return (
        "ચાલો ધીમેથી શરૂ કરીએ 🔥\n\n" +
        "2-મિનિટ નિયમ:\n" +
        "ફક્ત 2 મિનિટ ભણવાનું વચન — પુસ્તક ખોલો, એક પાનું વાંચો.\n\n" +
        "આજનું મિની-મિશન:\n" +
        "1. ફોન અન્ય રૂમમાં\n" +
        "2. એક વિષય પસંદ\n" +
        "3. 15 મિનિટ ટાઇમર\n" +
        "4. પૂરું થયા પછી નાનું ઇનામ\n\n" +
        "ક્રિયા પ્રેરણા લાવે છે. કયો વિષય છે?"
      );
    }

    if (/પ્લાન|plan|સમયપત્રક|timetable|schedule|સ્ટડી/i.test(t)) {
      var hours = 2;
      var m = t.match(/(\d+)\s*(કલાક|hour|hr)/i);
      if (m) hours = Math.min(8, Math.max(1, parseInt(m[1], 10)));
      return (
        "આપનું સ્ટડી પ્લાન — આશરે " +
        hours +
        " કલાક 📚\n\n" +
        "• 0:00–0:25 — મુખ્ય વિષય (કોન્સેપ્ટ)\n" +
        "• 0:25–0:30 — બ્રેક + પાણી\n" +
        "• 0:30–0:55 — પ્રેક્ટિસ / સવાલ\n" +
        "• 0:55–1:05 — લાંબો બ્રેક\n" +
        "• 1:05–1:30 — બીજો વિષય\n" +
        "• 1:30–1:35 — બ્રેક\n" +
        "• 1:35–2:00 — રિવિઝન + 5 સવાલ\n\n" +
        "નિયમ: ફોન દૂર · એક વિષય · નોંધ લખો"
      );
    }

    if (/ટુ-?ડુ|todo|to-?do|યાદી|task/i.test(t)) {
      return (
        "આજની ભણતર ટુ-ડુ ✅\n\n" +
        "Must:\n" +
        "☐ મુખ્ય વિષય 25 મિનિટ\n" +
        "☐ 10 પ્રેક્ટિસ સવાલ\n" +
        "☐ ગઈકાલની નોંધ 10 મિ રિવિઝન\n\n" +
        "Should:\n" +
        "☐ નબળા ટોપિકની સારાંશ\n" +
        "☐ 5 સવાલની ક્વિઝ\n\n" +
        "Nice:\n" +
        "☐ 5 અંગ્રેજી શબ્દ\n" +
        "☐ 10 મિનિટ સ્ટ્રેચ"
      );
    }

    if (/ક્વિઝ|quiz|સવાલ|mcq|પ્રશ્ન/i.test(t)) {
      return (
        "ઝડપી ક્વિઝ — 5 સવાલ 🧠\n\n" +
        "1. પ્રકાશ સંશ્લેષણમાં છોડ શું બનાવે?\n" +
        "2. 3/4 માં અંશ કયો?\n" +
        "3. “I am reading” કયો tense?\n" +
        "4. પોમોડોરો ફોકસ સમય?\n" +
        "5. પાયથાગોરસ કયા ત્રિકોણ માટે?\n\n" +
        "—— જવાબો ——\n" +
        "1. ગ્લુકોઝ + ઑક્સિજન\n" +
        "2. 3\n" +
        "3. Present Continuous\n" +
        "4. 25 મિનિટ\n" +
        "5. જમણા કોણવાળા\n\n" +
        "સ્કોર કેટલો?"
      );
    }

    if (/પરીક્ષા|exam|board|બોર્ડ|તૈયારી/i.test(t)) {
      return (
        "પરીક્ષા તૈયારી ટિપ્સ 📝\n\n" +
        "• Active recall — બંધ પુસ્તકે યાદ કરો\n" +
        "• નબળા મુદ્દા પહેલા\n" +
        "• દરરોજ ટૂંકી ક્વિઝ\n" +
        "• પેપરમાં સરળ સવાલ પહેલા\n" +
        "• રાત્રે 7+ કલાક ઊંઘ"
      );
    }

    if (/આભાર|ધન્યવાદ|thanks|thank you|thx/i.test(t)) {
      return "આપનું સ્વાગત છે! 🌟 વધુ કંઈ હોય તો લખો.";
    }

    if (/તમે કોણ|who are you|તારું નામ|your name/i.test(t)) {
      return (
        "હું BDC છું — તમારો Personal Study Assistant.\n" +
        "ગુજરાતીમાં વાત કરું છું અને ભણતરમાં મદદ કરું છું."
      );
    }

    var math = t.replace(/×/g, "*").replace(/÷/g, "/").replace(/x/gi, "*");
    var mm = math.match(/(-?\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(-?\d+(?:\.\d+)?)/);
    if (mm) {
      var a = parseFloat(mm[1]);
      var op = mm[2];
      var b = parseFloat(mm[3]);
      var r;
      if (op === "+") r = a + b;
      else if (op === "-") r = a - b;
      else if (op === "*") r = a * b;
      else if (op === "/") {
        if (b === 0) return "શૂન્ય વડે ભાગાકાર શક્ય નથી.";
        r = a / b;
      }
      if (typeof r === "number" && isFinite(r)) {
        if (Math.abs(r - Math.round(r)) > 1e-9) r = Math.round(r * 1000) / 1000;
        return "ગણતરી:\n" + a + " " + op + " " + b + " = " + r;
      }
    }

    return (
      "સમજાયું — હું મદદ કરવા તૈયાર છું!\n\n" +
      "આમ અજમાવો:\n" +
      "• ફોટોસિન્થેસિસ સમજાવો\n" +
      "• 2 કલાકનું સ્ટડી પ્લાન\n" +
      "• ક્વિઝ આપો\n" +
      "• પ્રેરણા આપો\n" +
      "• Tenses સમજાવો\n\n" +
      "અથવા “મદદ” લખો."
    );
  }

  global.BDCAgent = { reply: reply };
  global.BhaveshAgent = global.BDCAgent;
})(typeof window !== "undefined" ? window : globalThis);
