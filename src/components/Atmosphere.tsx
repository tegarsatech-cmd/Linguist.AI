import { motion } from 'motion/react';

export default function Atmosphere() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Deep Shadow Mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.03),transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.02),transparent_40%)]" />
      
      {/* Very subtle noise/texture could go here, but keeping it clean for "Sophisticated Dark" */}
    </div>
  );
}
