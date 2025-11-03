import React from 'react';

interface CardProps {
  title: string;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, children, actionButton }) => {
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {actionButton}
      </div>
      <div className="p-2 md:p-6">
        {children}
      </div>
    </div>
  );
};

export default Card;