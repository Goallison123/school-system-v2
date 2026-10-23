export const MAINTENANCE_MODE = true;
export const MAINTENANCE_MESSAGE = "System is under maintenance - Please try again later.";

export default function MaintenanceBanner() {
  if (!MAINTENANCE_MODE) return null;
  return (
    <div className="w-full bg-amber-500 text-white text-center text-sm py-2.5 px-4 font-bold fixed top-0 left-0 z-[9999] shadow">
       {MAINTENANCE_MESSAGE}
    </div>
  );
}