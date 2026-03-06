import { motion } from 'framer-motion';

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-[#2A2A2A] bg-[#0A0A0A]/80 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="flex items-center justify-between">
          <h1 className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent md:text-3xl">
            Audio to GTP
          </h1>
          <span className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-1.5 text-sm font-semibold text-white">
            Converter
          </span>
        </div>
        <p className="mt-2 text-[#A0A0A0]">
          Разделяй любой трек на дорожки и конвертируй в MIDI
        </p>
      </div>
    </motion.header>
  );
}
