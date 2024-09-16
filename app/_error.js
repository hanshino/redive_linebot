module.exports = async function HandleError(context, props) {
  console.error(props.error.stack);
};
