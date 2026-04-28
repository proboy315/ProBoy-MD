const config = require('../../config');

module.exports = {
  name: 'hack',
  aliases: [],
  category: 'fun',
  description: '💻 Hacking prank animation',
  usage: '.hack',
  async execute(sock, msg, args, extra) {
    const { reply, from } = extra;
    const steps = [
      'Injecting Malware',
      ' █ 10%',
      ' █ █ 20%',
      ' █ █ █ 30%',
      ' █ █ █ █ 40%',
      ' █ █ █ █ █ 50%',
      ' █ █ █ █ █ █ 60%',
      ' █ █ █ █ █ █ █ 70%',
      ' █ █ █ █ █ █ █ █ 80%',
      ' █ █ █ █ █ █ █ █ █ 90%',
      ' █ █ █ █ █ █ █ █ █ █ 100%',
      'System hyjacking on process.. \n Conecting to Server error to find 404',
      'Device successfully connected... \n Receiving data...',
      'Data hyjacked from device 100% completed \n killing all evidence killing all malwares...',
      ' HACKING COMPLETED',
      ' SENDING LOG DOCUMENTS...',
      ' SUCCESSFULLY SENT DATA AND Connection disconnected',
      'BACKLOGS CLEARED',
      'Your Whatsapp Was Hacked 😏'
    ];
    for (const line of steps) {
      await sock.sendMessage(from, { text: line }, { quoted: msg });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};
