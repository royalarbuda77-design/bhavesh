package com.jarvis.assistant.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.assistant.ui.JarvisCyan
import com.jarvis.assistant.ui.JarvisTextDim
import com.jarvis.assistant.ui.components.Chip
import com.jarvis.assistant.ui.components.PanelCard
import com.jarvis.assistant.ui.components.ScanLine
import com.jarvis.assistant.ui.components.SectionTitle

private data class Cmd(val en: String, val gu: String, val hi: String)

private val groups = listOf(
    "SYSTEM & SETTINGS" to listOf(
        Cmd("turn on wifi", "વાઇફાઇ ચાલુ કરો", "वाईफ़ाई ऑन करो"),
        Cmd("turn off bluetooth", "બ્લૂટૂથ બંધ કરો", "ब्लूटूथ बंद करो"),
        Cmd("flashlight on", "ટોર્ચ ચાલુ કરો", "टॉर्च चालू करो"),
        Cmd("set brightness to 60 percent", "બ્રાઇટનેસ ૬૦ ટકા કરો", "ब्राइटनेस 60 प्रतिशत करो"),
        Cmd("enable airplane mode", "એરપ્લેન મોડ ચાલુ કરો", "एयरप्लेन मोड ऑन करो"),
        Cmd("open hotspot settings", "હૉટસ્પૉટ સેટિંગ્સ ખોલો", "हॉटस्पॉट सेटिंग्स खोलो"),
        Cmd("mute the phone", "ફોન સાયલન્ટ કરો", "फोन साइलेंट करो"),
        Cmd("what's my battery", "મારી બેટરી કેટલી છે?", "मेरी बैटरी कितनी है?")
    ),
    "APPS & MEDIA" to listOf(
        Cmd("open WhatsApp", "વાટ્સએપ ખોલો", "व्हाट्सएप खोलो"),
        Cmd("close camera", "કેમેરા બંધ કરો", "कैमरा बंद करो"),
        Cmd("play Kesariya on YouTube", "યૂટ્યુબ પર કેસરિયા વગાડો", "यूट्यूब पर केसरिया बजाओ"),
        Cmd("play my workout playlist", "મારું વર્કઆઉટ પ્લેલિસ્ટ વગાડો", "मेरा वर्कआउट प्लेलिस्ट बजाओ"),
        Cmd("pause music", "મ્યુઝિક પૉજ કરો", "म्यूज़िक पॉज़ करो"),
        Cmd("volume up", "વૉલ્યુમ વધારો", "वॉल्यूम बढ़ाओ")
    ),
    "CALLS & MESSAGES" to listOf(
        Cmd("call mom", "મમ્મીને કૉલ કરો", "माँ को कॉल करो"),
        Cmd("video call Bablu", "બાબલુને વીડિયૉલ કૉલ", "बब्लु को वीडियो कॉल"),
        Cmd("send message to Ramesh: I'll be late", "રમેશને મેસેજ: હું મોડું થશે", "रमेश को मैसेज: मैं लेट होऊंगा"),
        Cmd("send email to priya@x.com about the invoice", "પ્રિયાને ઇન્વૉઇસ વિશે ઈમેલ લખો", "प्रिया को इनवॉइस पे ईमेल लिखो")
    ),
    "TIME & REMINDERS" to listOf(
        Cmd("set an alarm for 7 am", "સવારે ૭ વાગ્યે એલાર્મ મૂકો", "सुबह 7 बजे अलार्म लगाओ"),
        Cmd("remind me to pay rent tomorrow at 10", "ટોમરો ૧૦ વાગ્યે ભાડું ભૂલાવો", "कल 10 बजे किराया याद दिलाओ"),
        Cmd("set a timer for ten minutes", "દસ મિનિટનો ટાઈમર મૂકો", "दस मिनट का टाइमर लगाओ"),
        Cmd("what's on my calendar today", "આજે કેલેન્ડરમાં શું છે?", "आज कैलेंडर में क्या है?")
    ),
    "SCREEN & VISION" to listOf(
        Cmd("what does this say?", "આ શું લખ્યું છે?", "यहाँ क्या लिखा है?"),
        Cmd("describe this screen", "આ સ્ક્રીન વિશે કહો", "इस स्क्रीन के बारे में बताओ"),
        Cmd("translate this", "આનું ટ્રાન્સલેશન કરો", "इसका अनुवाद करो")
    ),
    "JARVIS CONTROL" to listOf(
        Cmd("wake up Jarvis", "જાર્વિસ જાગો", "जार्विस जागो"),
        Cmd("shutdown Jarvis", "જાર્વિસ શટડાઉન", "जार्विस शटडाउन"),
        Cmd("stop talking / silence", "બોલવાનું બંધ કરો", "बोलना बंद करो"),
        Cmd("go to sleep", "સૂઈ જાઓ", "सो जाओ")
    ),
    "MIXED · Code-switch (Hinglish/Gujlish)" to listOf(
        Cmd("wifi off kar do bhai", "વાઇફાઇ બંધ કર દે ભાઈ", "भाई वाईफ़ाई बंद कर दे"),
        Cmd("movie na badha do YouTube par", "મૂવી ચાલુ કરો યૂટ્યુબ પર", "मूवी चालू कर दे YouTube पे"),
        Cmd("call કરો મમ્મી નો", "કૉલ મમ્મી ને", "कॉल करो मम्मी को")
    )
)

@Composable
fun CommandsScreen() {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "Say it in any language — Jarvis understands English, ગુજરાતી, हिन्दी and mixed sentences.",
            color = JarvisTextDim,
            fontSize = 12.sp
        )
        ScanLine()
        groups.forEach { (title, cmds) ->
            SectionTitle(title)
            PanelCard {
                cmds.forEach { cmd ->
                    Column(Modifier.padding(vertical = 5.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Chip("EN", JarvisCyan)
                            Text(cmd.en, fontSize = 13.sp, color = Color(0xFFDCF6FF), modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(3.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Chip("ગુ", Color(0xFFFFD166))
                            Text(cmd.gu, fontSize = 12.5.sp, color = JarvisTextDim, modifier = Modifier.weight(1f))
                            Chip("हि", Color(0xFF7CFFCB))
                            Text(cmd.hi, fontSize = 12.5.sp, color = JarvisTextDim, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        Text(
            "These run offline too (no internet): Wi-Fi, Bluetooth, torch, volume, alarm, timer, brightness, open-app, mute.",
            color = JarvisCyan.copy(alpha = 0.85f),
            fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp)
        )
    }
}
