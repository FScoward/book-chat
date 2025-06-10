
import React from 'react';
import { XCircleIcon, InformationCircleIcon, ExclamationTriangleIcon } from './Icons';


interface AlertMessageProps {
  type: 'error' | 'info' | 'warning';
  message: string;
  onClose?: () => void;
}

const AlertMessage: React.FC<AlertMessageProps> = ({ type, message, onClose }) => {
  const baseClasses = "p-4 rounded-md flex items-start shadow-lg";
  const typeClasses = {
    error: "bg-red-700 text-red-100",
    info: "bg-sky-700 text-sky-100",
    warning: "bg-yellow-600 text-yellow-100",
  };

  const IconComponent = {
    error: XCircleIcon,
    info: InformationCircleIcon,
    warning: ExclamationTriangleIcon,
  }[type];


  return (
    <div className={`${baseClasses} ${typeClasses[type]}`} role="alert">
      <div className="flex-shrink-0 mr-3">
        <IconComponent className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="-mx-1.5 -my-1.5 ml-auto p-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-current"
          aria-label="閉じる"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default AlertMessage;