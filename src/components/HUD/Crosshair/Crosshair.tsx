import './Crosshair.css';

interface CrosshairProps {
  isVisible: boolean;
}

const Crosshair = ({ isVisible }: CrosshairProps) => {
  if (!isVisible) return null;

  return <div className="crosshair" id="crosshair"></div>;
};

export default Crosshair;
