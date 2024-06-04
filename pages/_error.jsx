import Error from "next/error";

const CustomErrorComponent = (props) => {
  return <div></div>
};

CustomErrorComponent.getInitialProps = async (contextData) => {

  // This will contain the status code of the response
  return Error.getInitialProps(contextData);
};

export default CustomErrorComponent;
