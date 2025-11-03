import React from 'react';

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => {
  const activeClasses = 'border-blue-500 text-blue-400';
  const inactiveClasses = 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500';

  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-lg transition-colors ${isActive ? activeClasses : inactiveClasses}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </button>
  );
};

export default TabButton;